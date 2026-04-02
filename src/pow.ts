import {
  base58AddressToLockingBytecode,
  swapEndianness,
} from "@bitauth/libauth";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { Script } from "@radiantblockchain/radiantjs";
import { Contract, Work } from "./types";
import { sha256 } from "@noble/hashes/sha256";
import { cat } from "./utils";

export function powPreimage(work: Work) {
  const inputCsh = sha256(sha256(work.inputScript));
  const outputCsh = sha256(sha256(work.outputScript));
  return cat(
    sha256(cat(work.txid, work.contractRef)),
    sha256(cat(inputCsh, outputCsh))
  );
}

export const MAX_TARGET = 0x7fffffffffffffffn; // Doesn't include starting 00000000

export function calcTimeToMine(target: bigint, hashesPerSecond: number) {
  // 33 bits (4 bytes + 1 bit to make the next 64 bit number unsigned)
  return Math.round(
    (Number(MAX_TARGET / target) * Math.pow(2, 33)) / hashesPerSecond
  );
}

export function mintMessageScript(message: string) {
  const magicBytes = "6d7367"; // msg
  const msgHex = bytesToHex(new TextEncoder().encode(message));
  return Script.fromASM(`OP_RETURN ${magicBytes} ${msgHex}`);
}

export function createWork(
  contract: Contract,
  address: string,
  message: string
): Work | undefined {
  const p2pkh = base58AddressToLockingBytecode(address);
  if (typeof p2pkh === "string") {
    console.debug("Invalid address");
    return;
  }

  const inputScript = p2pkh.bytecode;
  const outputScript = new Uint8Array(mintMessageScript(message).toBuffer());

  return {
    txid: hexToBytes(swapEndianness(contract.location)),
    contractRef: hexToBytes(contract.contractRef),
    inputScript,
    outputScript,
    target: contract.target,
  };
}
