import { Buffer } from "buffer";
import { decode } from "cbor-x";
import { Script, Transaction } from "@radiantblockchain/radiantjs";
import type { Contract, Glyph } from "./types";
import { isRef, opcodeToNum, push4bytes, pushMinimal, reverseRef } from "./utils";
import { swapEndianness } from "@bitauth/libauth";
import { fetchRef, fetchTx } from "./client";
import { 
  GlyphProtocol, 
  DmintAlgorithmId, 
  DaaModeId,
  GLYPH_VERSION,
} from "./types";

export const glyphHex = "676c79"; // gly
export const glyphMagic = Buffer.from("gly", "ascii");

/**
 * Glyph v2 envelope flags
 */
export const EnvelopeFlags = {
  HAS_CONTENT_ROOT: 1 << 0,
  HAS_CONTROLLER: 1 << 1,
  HAS_PROFILE_HINT: 1 << 2,
  IS_REVEAL: 1 << 7,
} as const;

/**
 * Check if protocols indicate a v2 dMint token
 */
export function isDmintToken(protocols: number[]): boolean {
  return protocols.includes(GlyphProtocol.GLYPH_FT) && 
         protocols.includes(GlyphProtocol.GLYPH_DMINT);
}

/**
 * Get algorithm name from ID
 */
export function getAlgorithmName(algoId: number): string {
  switch (algoId) {
    case DmintAlgorithmId.SHA256D: return 'SHA256d';
    case DmintAlgorithmId.BLAKE3: return 'Blake3';
    case DmintAlgorithmId.K12: return 'KangarooTwelve';
    case DmintAlgorithmId.ARGON2ID_LIGHT: return 'Argon2id-Light';
    case DmintAlgorithmId.RANDOMX_LIGHT: return 'RandomX-Light';
    default: return 'Unknown';
  }
}

/**
 * Get DAA mode name from ID
 */
export function getDaaModeName(modeId: number): string {
  switch (modeId) {
    case DaaModeId.FIXED: return 'Fixed';
    case DaaModeId.EPOCH: return 'Epoch';
    case DaaModeId.ASERT: return 'ASERT';
    case DaaModeId.LWMA: return 'LWMA';
    case DaaModeId.SCHEDULE: return 'Schedule';
    default: return 'Unknown';
  }
}

/**
 * Parse v2 dMint metadata
 */
export function parseDmintMetadata(payload: Record<string, unknown>): {
  algorithm: number;
  daaMode: number;
  maxSupply?: bigint;
  reward?: bigint;
  difficulty?: bigint;
} | undefined {
  const dmint = payload.dmint as Record<string, unknown> | undefined;
  if (!dmint) return undefined;

  return {
    algorithm: typeof dmint.algo === 'number' ? dmint.algo : DmintAlgorithmId.SHA256D,
    daaMode: typeof dmint.daa === 'number' ? dmint.daa : DaaModeId.FIXED,
    maxSupply: typeof dmint.max === 'bigint' ? dmint.max : undefined,
    reward: typeof dmint.reward === 'bigint' ? dmint.reward : undefined,
    difficulty: typeof dmint.diff === 'bigint' ? dmint.diff : undefined,
  };
}

/**
 * Check if this is a v2 glyph based on version field
 */
export function isGlyphV2(payload: Record<string, unknown>): boolean {
  return payload.v === GLYPH_VERSION;
}

export function decodeGlyph(script: Script): undefined | Glyph {
  let result: { payload: { [key: string]: unknown } } = {
    payload: {},
  };
  (
    script.chunks as {
      opcodenum: number;
      buf?: Uint8Array;
    }[]
  ).some(({ opcodenum, buf }, index) => {
    if (
      !buf ||
      opcodenum !== 3 ||
      Buffer.from(buf).toString("hex") !== glyphHex ||
      script.chunks.length <= index + 1
    ) {
      return false;
    }

    const payload = script.chunks[index + 1];
    const decoded = decode(Buffer.from(payload.buf));
    if (!decoded) {
      return false;
    }

    result = {
      payload: decoded,
    };
    return true;
  });

  if (
    !Array.isArray(result.payload.p) ||
    !result.payload.p.includes(1) ||
    !result.payload.p.includes(4)
  )
    return undefined;

  // Separate meta and file fields from root object
  const { meta, files } = Object.entries(result.payload).reduce<{
    meta: [string, unknown][];
    files: [string, unknown][];
  }>(
    (a, [k, v]) => {
      const embed = v as { t: string; b: Uint8Array };
      const isEmbed =
        typeof embed.t === "string" && embed.b instanceof Uint8Array;
      if (isEmbed) {
        a.files.push([k, v]);
      } else {
        a.meta.push([k, v]);
      }
      return a;
    },
    { meta: [], files: [] }
  );

  return {
    payload: {
      ...Object.fromEntries(meta),
    },
    files: Object.fromEntries(files) as {
      [key: string]: { t: string; b: Uint8Array };
    },
  };
}

export async function fetchToken(contractRef: string) {
  if (!isRef(contractRef)) {
    console.debug("Not a ref");
    return;
  }

  console.debug(`Fetching ${contractRef}`);
  const refLe = reverseRef(contractRef);

  const refTxids = await fetchRef(contractRef);
  if (!refTxids.length) {
    console.debug("Ref not found:", contractRef);
    return;
  }

  const revealTxid = refTxids[0].tx_hash;
  const revealTx = await fetchTx(revealTxid, false);
  const revealParams = await parseContractTx(revealTx, refLe);

  if (!revealParams || revealParams.state === "burn") {
    return;
  }

  // TODO pick random location that still has tokens available

  const locTxid = refTxids[1].tx_hash;
  const fresh = revealTxid === locTxid;
  const locTx = fresh ? revealTx : await fetchTx(locTxid, true);
  const locParams = fresh ? revealParams : await parseContractTx(locTx, refLe);
  if (!locParams) {
    return;
  }
  const currentParams =
    locParams.state === "burn"
      ? {
          ...revealParams.params,
          height: revealParams.params.maxHeight,
          message: locParams.params.message,
        }
      : locParams.params;

  // Find token script in the reveal tx
  const tokenRefBE = swapEndianness(currentParams.tokenRef);
  const refTxId = tokenRefBE.substring(8);
  const refVout = parseInt(tokenRefBE.substring(0, 8), 10);
  const revealIndex = revealTx.inputs.findIndex(
    (input) =>
      input.prevTxId.toString("hex") === refTxId &&
      input.outputIndex === refVout
  );
  const script = revealIndex >= 0 && revealTx.inputs[revealIndex].script;

  if (!script) {
    console.debug("Glyph script not found");
    return;
  }

  const glyph = decodeGlyph(script);

  if (!glyph) {
    console.debug("Invalid glyph script");
    return;
  }

  return { glyph, contract: currentParams };
}

export function dMintScript({
  height,
  contractRef,
  tokenRef,
  maxHeight,
  reward,
  target,
}: Contract) {
  return `${push4bytes(
    Number(height)
  )}d8${contractRef}d0${tokenRef}${pushMinimal(maxHeight)}${pushMinimal(
    reward
  )}${pushMinimal(
    target
  )}bd5175c0c855797ea8597959797ea87e5a7a7eaabc01147f77587f040000000088817600a269a269577ae500a069567ae600a06901d053797e0cdec0e9aa76e378e4a269e69d7eaa76e47b9d547a818b76537a9c537ade789181547ae6939d635279cd01d853797e016a7e886778de519d547854807ec0eb557f777e5379ec78885379eac0e9885379cc519d75686d7551`;
}

export function burnScript(ref: string) {
  return `d8${ref}6a`;
}

export function parseDmintScript(script: string): string {
  const pattern =
    /^(.*)bd5175c0c855797ea8597959797ea87e5a7a7e(?:aa|ee|ef)bc01147f77587f040000000088817600a269a269577ae500a069567ae600a06901d053797e0cdec0e9aa76e378e4a269e69d7eaa76e47b9d547a818b76537a9c537ade789181547ae6939d635279cd01d853797e016a7e886778de519d547854807ec0eb557f777e5379ec78885379eac0e9885379cc519d75686d7551$/;
  const [, stateScript] = script.match(pattern) || [];
  return stateScript;
}

export function parseBurnScript(script: string): string {
  const pattern = /^d8([0-9a-f]{64}[0-9]{8})6a$/;
  const [, ref] = script.match(pattern) || [];
  return ref;
}

export function parseMessageScript(script: string): string {
  const pattern = /^6a036d7367(.*)$/;
  const [, msg] = script.match(pattern) || [];
  if (!msg) return "";

  const chunks = new Script(msg).chunks as {
    opcodenum: number;
    buf?: Uint8Array;
  }[];

  if (chunks.length === 0 || !chunks[0].buf || chunks[0].buf.byteLength === 0) {
    return "";
  }

  return new TextDecoder().decode(chunks[0].buf);
}

export async function parseContractTx(tx: Transaction, ref: string) {
  const stateScripts: [number, string, string][] = [];
  const burns: string[] = [];
  const messages: string[] = [];

  tx.outputs.forEach((o, i) => {
    const hex = o.script.toHex();
    const dmint = parseDmintScript(hex);
    if (dmint) {
      const codeScript = hex.substring(dmint.length + 2);
      return stateScripts.push([i, dmint, codeScript]);
    }

    const burn = parseBurnScript(hex);
    if (burn) {
      if (burn === ref) {
        burns.push(burn);
      }
      return;
    }

    const msg = parseMessageScript(hex);
    if (msg) {
      // Truncate messages to 80 characters
      messages.push(msg.substring(0, 80));
    }
  });

  const message = messages[0] || "";

  // State script:
  // height OP_PUSHINPUTREF contractRef OP_PUSHINPUTREF tokenRef maxHeight reward target
  const contracts = stateScripts
    .map(([outputIndex, script, codeScript]) => {
      const opcodes = Script.fromHex(script).toASM().split(" ");
      const [op1, contractRef] = opcodes.splice(1, 2);
      const [op2, tokenRef] = opcodes.splice(1, 2);

      if (
        op1 !== "OP_PUSHINPUTREFSINGLETON" ||
        op2 !== "OP_PUSHINPUTREF" ||
        contractRef !== ref
      ) {
        return;
      }

      const numbers = opcodes.map(opcodeToNum).filter((v) => v !== false);
      if (numbers.length < 4) {
        return;
      }

      const [height, maxHeight, reward, target, v5, v6, v7] = numbers as bigint[];
      const hasAlgoId = numbers.length >= 7;
      const algoId = hasAlgoId ? v5 : undefined;
      const lastTime = hasAlgoId ? v6 : v5;
      const targetTime = hasAlgoId ? v7 : v6;
      return {
        state: "active",
        params: {
          location: tx.id,
          outputIndex,
          height,
          contractRef,
          tokenRef,
          maxHeight,
          reward,
          target,
          algoId,
          lastTime,
          targetTime,
          script,
          codeScript,
          message,
        },
      };
    })
    .filter(Boolean) as { state: "active"; params: Contract }[];

  if (!contracts.length) {
    if (burns.length) {
      return {
        state: "burn" as const,
        ref,
        params: { message },
      };
    }
    console.debug("dmint contract not found");
    return;
  }

  return contracts[0];
}
