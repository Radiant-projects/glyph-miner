import { sha256 as jsSha256, Hasher } from "js-sha256";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha2";
import { blake3 } from "@noble/hashes/blake3";
import { k12 } from "@noble/hashes/sha3-addons";
import { swapEndianness } from "@bitauth/libauth";
import { Work, AlgorithmId } from "./types";
import {
  autoReseed,
  contract,
  found,
  glyph,
  hashrate,
  miningEnabled,
  miningStatus,
  mintMessage,
  wallet,
  work as workSignal,
} from "./signals";
import { addMessage } from "./message";
import { createWork, powPreimage } from "./pow";
import { foundNonce } from "./blockchain";
import { isAlgorithmSupported } from "./algorithms";
import { ALGORITHMS, calcTimeToMine } from "./algorithms/types";
import {
  NONCE_BYTES_V1,
  NONCE_BYTES_V2,
  NONCE_BYTES_SHA256D_V2,
  nonceBytesForContracts,
  nonceHexForContracts,
  normalizeNonceHexForScriptSig,
  nonceBytesForSha256d,
  nonceHexForSha256d,
} from "./nonce";

// Import shaders as raw text
import sha256dShaderText from "./shaders/sha256d.wgsl?raw";
import sha256d64BitShaderText from "./shaders/sha256d_64bit.wgsl?raw";
import blake3ShaderText from "./shaders/blake3.wgsl?raw";
import k12ShaderText from "./shaders/k12.wgsl?raw";

const NONCE_SPACE_SIZE = 0x1_0000_0000;
const MAX_MINT_MESSAGE_LENGTH = 80;
const GPU_VERIFY_FAILURE_THRESHOLD = 5;
const DEBUG_PARITY_NONCES = [0x00000001, 0x12345678];
let reseedRound = 0;

type ParityHarnessResult = {
  nonce: number;
  cpuHex: string;
  gpuHex: string;
  match: boolean;
};

type GlyphDebugApi = {
  testGpuParityBlake3: () => Promise<{
    algorithm: "blake3";
    allMatch: boolean;
    results: ParityHarnessResult[];
  }>;
  testGpuParityK12: () => Promise<{
    algorithm: "k12";
    allMatch: boolean;
    results: ParityHarnessResult[];
  }>;
};

declare global {
  interface Window {
    glyphDebug?: GlyphDebugApi;
  }
}

function buildEntropyMessage(baseMessage: string, round: number) {
  if (round <= 0) {
    return baseMessage;
  }

  const tag = ` [r${round.toString(36)}]`;
  const keepLength = Math.max(0, MAX_MINT_MESSAGE_LENGTH - tag.length);
  return `${baseMessage.slice(0, keepLength)}${tag}`;
}

function currentWorkMessage() {
  return buildEntropyMessage(mintMessage.value, reseedRound);
}

function stopAfterNonceSpaceExhausted(algorithm: AlgorithmId) {
  addMessage({
    type: "general",
    msg: `Exhausted full 32-bit nonce space for ${algorithm} with current work. Change mint message or wait for next contract update.`,
  });
  miningEnabled.value = false;
  addMessage({ type: "stop" });
  miningStatus.value = "stop";
}

function tryAutoReseedWork() {
  if (!autoReseed.value) {
    return;
  }

  reseedRound++;
  updateWork({ notify: false });
  const nextWork = workSignal.value;
  if (!nextWork) {
    return;
  }
  return nextWork;
}

function signedToHex(number: number) {
  let value = Math.max(-2147483648, Math.min(2147483647, number));
  if (value < 0) {
    value += 4294967296;
  }
  return value.toString(16).padStart(8, "0");
}

// Map algorithm ID number to AlgorithmId string (only consensus-supported GPU algos)
export function mapAlgorithmId(algoId: number): AlgorithmId | undefined {
  switch (algoId) {
    case 0x00:
      return "sha256d";
    case 0x01:
      return "blake3";
    case 0x02:
      return "k12";
    default:
      return;
  }
}

export function extractCodeScriptHashOp(codeScript?: string): "aa" | "ee" | "ef" | undefined {
  if (!codeScript) return;
  const match = codeScript
    .toLowerCase()
    .match(/7ea87e5a7a7e(aa|ee|ef)bc01147f/);
  return match?.[1] as "aa" | "ee" | "ef" | undefined;
}

export function mapHashOpToAlgorithm(hashOp?: "aa" | "ee" | "ef"): AlgorithmId | undefined {
  switch (hashOp) {
    case "aa": return "sha256d";
    case "ee": return "blake3";
    case "ef": return "k12";
    default: return;
  }
}

// Get algorithm - checks v2 glyph payload first, then falls back to contract (from API)
function getAlgorithm(): AlgorithmId | undefined {
  const payload = glyph.value?.payload;
  const payloadAlgoId = (payload?.dmint as { algo?: number } | undefined)?.algo;
  const payloadAlgo =
    typeof payloadAlgoId === "number" ? mapAlgorithmId(payloadAlgoId) : undefined;

  const hashOp = extractCodeScriptHashOp(contract.value?.codeScript);
  const codeScriptAlgo = mapHashOpToAlgorithm(hashOp);
  const contractAlgo = contract.value?.algorithm;

  console.debug("Mining sanity check", {
    payloadAlgoId,
    payloadAlgo,
    codeScriptHashOp: hashOp,
    codeScriptAlgo,
    contractAlgo,
  });

  if (codeScriptAlgo) {
    if (payloadAlgo && payloadAlgo !== codeScriptAlgo) {
      console.warn(
        `Payload algo mismatch: payload=${payloadAlgo} codeScript=${codeScriptAlgo}. Using codeScript algo.`
      );
    }
    if (contractAlgo && contractAlgo !== codeScriptAlgo) {
      console.warn(
        `Contract/API algo mismatch: contract=${contractAlgo} codeScript=${codeScriptAlgo}. Using codeScript algo.`
      );
    }
    return codeScriptAlgo;
  }

  // Prefer contract/API algorithm metadata when codeScript opcode is unavailable.
  if (contractAlgo) {
    console.log("Using algorithm from contract/API:", contractAlgo);
    return contractAlgo;
  }

  // Check v2 glyph payload for explicit dmint.algo
  if (typeof payloadAlgoId === "number") {
    if (!payloadAlgo) {
      console.warn(`Unsupported dmint algo id in payload: ${payloadAlgoId}`);
      return;
    }
    console.log(`Using algorithm from v2 glyph payload: ${payloadAlgoId} -> ${payloadAlgo}`);
    return payloadAlgo;
  }

  // Legacy contracts without explicit metadata are assumed SHA256d.
  return "sha256d";
}

// Get shader code for algorithm
function getShaderCode(algorithm: AlgorithmId, use64Bit: boolean = false): string {
  switch (algorithm) {
    case 'blake3': return blake3ShaderText;
    case 'k12': return k12ShaderText;
    default: return use64Bit ? sha256d64BitShaderText : sha256dShaderText;
  }
}

// Check if algorithm uses the v2 4-binding shader layout
// (midstate/target/results/nonce_offset) vs v1 3-binding (midstate/nonce/result)
function isV2ShaderLayout(algorithm: AlgorithmId): boolean {
  return algorithm === 'blake3' || algorithm === 'k12';
}

// Check if we should use 64-bit nonce for SHA256d efficiency
function shouldUse64BitNonce(_algorithm: AlgorithmId): boolean {
  return false;
}

export function updateWork(options?: { notify?: boolean }) {
  const notify = options?.notify ?? true;

  if (!contract.value || !wallet.value?.address) {
    workSignal.value = undefined;
    return;
  }
  
  // Get algorithm from v2 glyph payload or contract/API
  const algorithm = getAlgorithm();

  // Check if algorithm is supported
  if (!algorithm || !isAlgorithmSupported(algorithm)) {
    workSignal.value = undefined;
    if (notify) {
      addMessage({
        type: "general",
        msg: `Unsupported algorithm${algorithm ? `: ${algorithm}` : ""}`,
      });
    }
    miningStatus.value = "stop";
    return;
  }
  
  // Create work with algorithm info
  const work = createWork(
    contract.value,
    wallet.value.address,
    currentWorkMessage()
  );
  if (!work) {
    workSignal.value = undefined;
    return;
  }
  
  // Add algorithm to work object
  (work as any).algorithm = algorithm;
  
  workSignal.value = work;
  
  // Log algorithm info
  const algoInfo = ALGORITHMS[algorithm];
  if (notify) {
    addMessage({ type: "general", msg: `Using ${algoInfo.name} algorithm` });
  }
  
  // Show collision warning if applicable
  const timeToMine = calcTimeToMine(Number(contract.value.target), algorithm, hashrate.value || undefined);
  if (notify && timeToMine < 30) {
    addMessage({ type: "general", msg: `Warning: Fast expected solve time (${timeToMine}s) may cause collisions` });
  }
}

// Use js-sha256 to get the midstate after hashing the first 512 bit block
function partialHash(data: Uint8Array) {
  const hash = jsSha256.create();
  hash.update(data);
  // Make h properties accessible without an error
  const withH = hash as Hasher & {
    h0: number;
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
    h7: number;
  };
  return swapEndianness(
    [
      withH.h0,
      withH.h1,
      withH.h2,
      withH.h3,
      withH.h4,
      withH.h5,
      withH.h6,
      withH.h7,
    ]
      .map(signedToHex)
      .join("")
  );
}

function nonceHexForBytes(nonceHex: string, nonceBytes: 4 | 8): string {
  return normalizeNonceHexForScriptSig(nonceHex, nonceBytes);
}

export function nonceBytesFromU32(n: number): Uint8Array {
  return nonceBytesForContracts(n);
}

function buildV2Preimage(partialPreimage: Uint8Array, nonceU32: number): Uint8Array {
  const preimage = new Uint8Array(partialPreimage.byteLength + NONCE_BYTES_V2);
  preimage.set(partialPreimage);
  preimage.set(nonceBytesForContracts(nonceU32), partialPreimage.byteLength);
  return preimage;
}

export function canonicalV2Hash(
  algorithm: Extract<AlgorithmId, "blake3" | "k12">,
  partialPreimage: Uint8Array,
  nonceU32: number,
): Uint8Array {
  const preimage = buildV2Preimage(partialPreimage, nonceU32);
  if (algorithm === "blake3") {
    return blake3(preimage);
  }
  return k12(preimage, { dkLen: 32 });
}

function u32WordsToBytesLE(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < words.length; i++) {
    view.setUint32(i * 4, words[i], true);
  }
  return out;
}

export async function readGpuHashDebug(
  algorithm: Extract<AlgorithmId, "blake3" | "k12">,
  partialPreimage: Uint8Array,
  nonceU32: number,
): Promise<Uint8Array> {
  if (partialPreimage.byteLength < 64) {
    throw new Error("partialPreimage must be at least 64 bytes");
  }

  const adapter = await (navigator as any).gpu?.requestAdapter({
    powerPreference: "high-performance",
  });
  const device = await adapter?.requestDevice();
  if (!device) {
    throw new Error("No GPU device found.");
  }

  const module = device.createShaderModule({
    label: `${algorithm} debug module`,
    code: getShaderCode(algorithm),
  });
  const pipeline = device.createComputePipeline({
    label: `${algorithm} debug pipeline`,
    layout: "auto",
    compute: {
      module,
      entryPoint: "main",
    },
  });

  const midstateBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const targetBuffer = device.createBuffer({
    size: 12,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const resultsBuffer = device.createBuffer({
    size: 256 * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const nonceOffsetBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: midstateBuffer } },
      { binding: 1, resource: { buffer: targetBuffer } },
      { binding: 2, resource: { buffer: resultsBuffer } },
      { binding: 3, resource: { buffer: nonceOffsetBuffer } },
    ],
  });

  const gpuReadBuffer = device.createBuffer({
    size: 13 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  device.queue.writeBuffer(midstateBuffer, 0, partialPreimage.slice(0, 64));
  device.queue.writeBuffer(targetBuffer, 0, new Uint32Array([1, 0, 0]));
  device.queue.writeBuffer(resultsBuffer, 0, new Uint32Array(13));
  device.queue.writeBuffer(nonceOffsetBuffer, 0, new Uint32Array([nonceU32 >>> 0]));

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();
  encoder.copyBufferToBuffer(resultsBuffer, 0, gpuReadBuffer, 0, 13 * 4);
  device.queue.submit([encoder.finish()]);

  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const range = new Uint32Array(gpuReadBuffer.getMappedRange());
  const resultCount = range[0];
  if (resultCount === 0) {
    gpuReadBuffer.unmap();
    throw new Error(`${algorithm} debug shader did not return a hash`);
  }
  const hashWords = new Uint32Array(8);
  hashWords.set(range.slice(5, 13));
  gpuReadBuffer.unmap();

  return u32WordsToBytesLE(hashWords);
}

export async function runV2GpuCpuParityHarness(
  algorithm: Extract<AlgorithmId, "blake3" | "k12">,
  partialPreimage: Uint8Array,
  nonces: number[],
): Promise<{ nonce: number; cpuHex: string; gpuHex: string; match: boolean }[]> {
  const results: { nonce: number; cpuHex: string; gpuHex: string; match: boolean }[] = [];
  for (const nonce of nonces) {
    const nonceU32 = nonce >>> 0;
    const cpu = canonicalV2Hash(algorithm, partialPreimage, nonceU32);
    const gpu = await readGpuHashDebug(algorithm, partialPreimage, nonceU32);
    const cpuHex = bytesToHex(cpu);
    const gpuHex = bytesToHex(gpu);
    results.push({ nonce: nonceU32, cpuHex, gpuHex, match: cpuHex === gpuHex });
  }
  return results;
}

function debugParityPrefix64(): Uint8Array {
  const prefix = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    prefix[i] = i;
  }
  return prefix;
}

function registerGlyphDebugTools() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const runParity = async <T extends "blake3" | "k12">(algorithm: T): Promise<{
    algorithm: T;
    allMatch: boolean;
    results: ParityHarnessResult[];
  }> => {
    const partialPreimage = debugParityPrefix64();
    const results = await runV2GpuCpuParityHarness(
      algorithm,
      partialPreimage,
      DEBUG_PARITY_NONCES,
    );
    const allMatch = results.every((r) => r.match);
    console.table(results);
    console.log(`[glyphDebug] ${algorithm} parity ${allMatch ? "PASS" : "FAIL"}`);
    return { algorithm, allMatch, results };
  };

  window.glyphDebug = {
    testGpuParityBlake3: () => runParity("blake3"),
    testGpuParityK12: () => runParity("k12"),
  };
}

registerGlyphDebugTools();

function hashMeetsTarget(hash: Uint8Array, target: bigint): boolean {
  if (hash[0] !== 0 || hash[1] !== 0 || hash[2] !== 0 || hash[3] !== 0) {
    return false;
  }
  const view = new DataView(hash.slice(4, 12).buffer, 0);
  return view.getBigUint64(0, false) < target;
}

function verify(target: bigint, partialPreimage: Uint8Array, nonce: string) {
  const preimage = new Uint8Array(partialPreimage.byteLength + NONCE_BYTES_V1);
  preimage.set(partialPreimage);
  preimage.set(hexToBytes(nonceHexForBytes(nonce, 4)), 64);

  const hash = sha256(sha256(preimage));
  return hashMeetsTarget(hash, target);
}

// Batch verification for SHA256d solutions
function batchVerifySha256d(
  target: bigint, 
  partialPreimage: Uint8Array, 
  nonces: string[]
): { verified: string[]; count: number } {
  const verified: string[] = [];
  
  for (const nonce of nonces) {
    if (verify(target, partialPreimage, nonce)) {
      verified.push(nonce);
    }
  }
  
  return { verified, count: verified.length };
}

// 64-bit nonce verification for SHA256d
function verifySha256d64(
  target: bigint, 
  partialPreimage: Uint8Array, 
  nonceLow: number, 
  nonceHigh: number
): boolean {
  const nonceBytes = nonceBytesForSha256d(nonceLow, nonceHigh);
  const preimage = new Uint8Array(partialPreimage.byteLength + NONCE_BYTES_SHA256D_V2);
  preimage.set(partialPreimage);
  preimage.set(nonceBytes, 64);

  const hash = sha256(sha256(preimage));
  return hashMeetsTarget(hash, target);
}

function verifyK12(target: bigint, partialPreimage: Uint8Array, nonceU32: number) {
  const preimage = buildV2Preimage(partialPreimage, nonceU32);
  const hash = k12(preimage, { dkLen: 32 });
  return hashMeetsTarget(hash, target);
}

function verifyBlake3(target: bigint, partialPreimage: Uint8Array, nonceU32: number) {
  const preimage = buildV2Preimage(partialPreimage, nonceU32);
  const hash = blake3(preimage);
  return hashMeetsTarget(hash, target);
}

async function stop() {
  console.debug("miner.stop called");
  if (miningStatus.value !== "ready") {
    miningStatus.value = "stop";
    // Wait for mining to stop then return true
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (miningStatus.value === "ready") {
          clearInterval(timer);
          resolve(true);
        }
      }, 100);
    });
  }
  return true;
}

function powMidstate(work: Work) {
  const preimage = powPreimage(work);
  const hash = hexToBytes(partialHash(preimage));
  return { preimage, hash };
}

const start = async () => {
  console.debug("miner.start called");
  reseedRound = 0;
  updateWork({ notify: false });
  let currentWork = workSignal.value;
  if (!currentWork) return;
  
  const algorithm: AlgorithmId = (currentWork as any).algorithm || 'sha256d';
  const codeScriptHashOp = extractCodeScriptHashOp(contract.value?.codeScript);
  const codeScriptAlgo = mapHashOpToAlgorithm(codeScriptHashOp);
  if (codeScriptAlgo && algorithm !== codeScriptAlgo) {
    console.error(
      `Preflight failed: mining algorithm ${algorithm} mismatches codeScript opcode ${codeScriptHashOp} (${codeScriptAlgo})`
    );
    addMessage({
      type: "general",
      msg: `Mining blocked: algorithm mismatch (${algorithm} vs contract ${codeScriptAlgo})`,
    });
    miningStatus.value = "stop";
    return;
  }
  const useV2Layout = isV2ShaderLayout(algorithm);
  const use64Bit = shouldUse64BitNonce(algorithm);
  
  let midstate = powMidstate(currentWork);
  miningStatus.value = "mining";

  const adapter = await (navigator as any).gpu?.requestAdapter({
    powerPreference: "high-performance",
  });
  const device = await adapter?.requestDevice();
  if (!device) {
    throw new Error("No GPU device found.");
  }

  const shaderCode = getShaderCode(algorithm, use64Bit);
  const module = device.createShaderModule({
    label: `${algorithm} module`,
    code: shaderCode,
  });

  const pipeline = device.createComputePipeline({
    label: `${algorithm} pipeline`,
    layout: "auto",
    compute: {
      module,
      entryPoint: "main",
    },
  });

  const numWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
  const workgroupSize = 256;
  const numInvocations = numWorkgroups * workgroupSize;

  if (useV2Layout) {
    // V2 layout: 4 bindings (midstate/target/results/nonce_offset)
    // Blake3: midstate=64B (16 u32), K12: midstate=64B (16 u32 from preimage)
    const midstateSize = 64;
    const targetSize = 12; // 3 u32s (pad, high, low)
    const resultsSize = 256 * 16; // 256 vec4<u32>
    const nonceSize = 4; // 1 u32 nonce offset

    const midstateBuffer = device.createBuffer({
      label: "midstate buffer", size: midstateSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const targetBuffer = device.createBuffer({
      label: "target buffer", size: targetSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const resultsBuffer = device.createBuffer({
      label: "results buffer", size: resultsSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const nonceOffsetBuffer = device.createBuffer({
      label: "nonce offset buffer", size: nonceSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      label: `${algorithm} bindGroup`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: midstateBuffer } },
        { binding: 1, resource: { buffer: targetBuffer } },
        { binding: 2, resource: { buffer: resultsBuffer } },
        { binding: 3, resource: { buffer: nonceOffsetBuffer } },
      ],
    });

    const gpuReadBuffer = device.createBuffer({
      size: 32, // Read first 2 vec4<u32> entries (result count + first result)
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Write midstate (first 64 bytes of preimage for Blake3/K12)
    device.queue.writeBuffer(midstateBuffer, 0, midstate.preimage.slice(0, 64));

    // Write target as 3 u32s: [0, high32, low32]
    let targetHigh = Number((currentWork.target >> 32n) & 0xFFFFFFFFn);
    let targetLow = Number(currentWork.target & 0xFFFFFFFFn);
    device.queue.writeBuffer(targetBuffer, 0, new Uint32Array([0, targetHigh, targetLow]));

    let nonceStart = 0;
    let startTime = Date.now();
    const maxNonce = NONCE_SPACE_SIZE - numInvocations;
    let consecutiveGpuVerifyFailures = 0;

    while (["mining", "change"].includes(miningStatus.value as string)) {
      if (nonceStart > maxNonce) {
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > 0 && nonceStart > 0) {
          hashrate.value = (nonceStart / elapsedMs) * 1000;
        }

        const reseededWork = tryAutoReseedWork();
        if (reseededWork) {
          currentWork = reseededWork;
          midstate = powMidstate(currentWork);
          device.queue.writeBuffer(midstateBuffer, 0, midstate.preimage.slice(0, 64));
          targetHigh = Number((currentWork.target >> 32n) & 0xFFFFFFFFn);
          targetLow = Number(currentWork.target & 0xFFFFFFFFn);
          device.queue.writeBuffer(targetBuffer, 0, new Uint32Array([0, targetHigh, targetLow]));
          nonceStart = 0;
          startTime = Date.now();
          continue;
        }

        stopAfterNonceSpaceExhausted(algorithm);
        break;
      }

      // Clear results counter
      device.queue.writeBuffer(resultsBuffer, 0, new Uint32Array([0, 0, 0, 0]));
      // Write nonce offset
      device.queue.writeBuffer(nonceOffsetBuffer, 0, new Uint32Array([nonceStart]));

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(numWorkgroups);
      pass.end();
      encoder.copyBufferToBuffer(resultsBuffer, 0, gpuReadBuffer, 0, 32);
      device.queue.submit([encoder.finish()]);

      await gpuReadBuffer.mapAsync(GPUMapMode.READ);
      const range = new Uint32Array(gpuReadBuffer.getMappedRange());
      const resultCount = range[0];
      let shouldStopForGpuMismatch = false;
      if (resultCount > 255) {
        console.warn(`${algorithm} shader reported ${resultCount} results; truncating to first 255.`);
      }
      if (resultCount > 0) {
        // First result at flat offset 4: [nonce, hash0, hash1, flag]
        const foundNonceVal = range[4] >>> 0;
        const nonceHex = useV2Layout
          ? nonceHexForContracts(foundNonceVal)
          : swapEndianness(foundNonceVal.toString(16).padStart(8, "0"));
        // CPU-side verification before submitting
        const verified =
          algorithm === "sha256d"
            ? verify(currentWork.target, midstate.preimage, nonceHex)
            : algorithm === "blake3"
              ? verifyBlake3(currentWork.target, midstate.preimage, foundNonceVal)
              : verifyK12(currentWork.target, midstate.preimage, foundNonceVal);
        if (verified) {
          consecutiveGpuVerifyFailures = 0;
          console.log(`${algorithm} solution verified, nonce: ${nonceHex}`);
          foundNonce(nonceHex);
          addMessage({ type: "found", nonce: nonceHex });
          found.value++;
        } else {
          consecutiveGpuVerifyFailures++;
          console.warn(`${algorithm} GPU found nonce ${nonceHex} but CPU verification failed`);
          if (consecutiveGpuVerifyFailures >= GPU_VERIFY_FAILURE_THRESHOLD) {
            addMessage({
              type: "general",
              msg: `Disabling GPU mining for this session after ${consecutiveGpuVerifyFailures} consecutive CPU verification mismatches.`,
            });
            if (import.meta.env.DEV) {
              addMessage({
                type: "general",
                msg: "Debug tip: run window.glyphDebug.testGpuParityBlake3() or window.glyphDebug.testGpuParityK12()",
              });
            }
            miningEnabled.value = false;
            addMessage({ type: "stop" });
            miningStatus.value = "stop";
            shouldStopForGpuMismatch = true;
          }
        }
      }
      gpuReadBuffer.unmap();
      if (shouldStopForGpuMismatch) {
        break;
      }
      nonceStart += numInvocations;
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > 0 && nonceStart > 0) {
        hashrate.value = (nonceStart / elapsedMs) * 1000;
      }

      // @ts-expect-error doesn't matter
      if (miningStatus.value === "change") {
        updateWork();
        if (!workSignal.value) break;
        currentWork = workSignal.value;
        reseedRound = 0;
        midstate = powMidstate(currentWork);
        device.queue.writeBuffer(midstateBuffer, 0, midstate.preimage.slice(0, 64));
        targetHigh = Number((currentWork.target >> 32n) & 0xFFFFFFFFn);
        targetLow = Number(currentWork.target & 0xFFFFFFFFn);
        device.queue.writeBuffer(targetBuffer, 0, new Uint32Array([0, targetHigh, targetLow]));
        miningStatus.value = "mining";
      }
    }
  } else if (use64Bit && algorithm === 'sha256d') {
    // 64-bit SHA256d mining: enhanced efficiency with larger nonce space
    const midstateBuffer = device.createBuffer({
      label: "midstate buffer", size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const nonceBuffer = device.createBuffer({
      label: "nonce buffer", size: 8, // 2 u32s for 64-bit nonce
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const resultsBuffer = device.createBuffer({
      label: "results buffer", size: 256 * 16, // Support multiple solutions
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      label: "sha256d-64bit bindGroup",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: midstateBuffer } },
        { binding: 1, resource: { buffer: nonceBuffer } },
        { binding: 2, resource: { buffer: resultsBuffer } },
      ],
    });

    const gpuReadBuffer = device.createBuffer({
      size: 1024, // Read multiple results
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);

    let nonceLow = 0;
    let nonceHigh = 0;
    let startTime = Date.now();
    const maxNonceLow = 0xFFFFFFFF;
    const maxNonceHigh = 0xFFFFFFFF;

    while (miningStatus.value === "mining" || miningStatus.value === "change") {
      if (nonceLow > maxNonceLow) {
        nonceLow = 0;
        nonceHigh++;
        if (nonceHigh > maxNonceHigh) {
          const elapsedMs = Date.now() - startTime;
          if (elapsedMs > 0) {
            const totalHashes = (BigInt(nonceHigh) << 32n) + BigInt(nonceLow);
            const hashesPerSecond = (totalHashes * 1000n) / BigInt(elapsedMs);
            hashrate.value = Number(hashesPerSecond);
          }

          const reseededWork = tryAutoReseedWork();
          if (reseededWork) {
            currentWork = reseededWork;
            midstate = powMidstate(currentWork);
            device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);
            nonceLow = 0;
            nonceHigh = 0;
            startTime = Date.now();
            continue;
          }

          stopAfterNonceSpaceExhausted(algorithm);
          break;
        }
      }

      // Write 64-bit nonce [low, high]
      device.queue.writeBuffer(nonceBuffer, 0, new Uint32Array([nonceLow, nonceHigh]));
      // Clear results
      device.queue.writeBuffer(resultsBuffer, 0, new Uint32Array(256 * 4));

      const encoder = device.createCommandEncoder({ label: "sha256d-64bit encoder" });
      const pass = encoder.beginComputePass({ label: "sha256d-64bit compute pass" });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(numWorkgroups);
      pass.end();
      encoder.copyBufferToBuffer(resultsBuffer, 0, gpuReadBuffer, 0, 1024);
      device.queue.submit([encoder.finish()]);

      await gpuReadBuffer.mapAsync(GPUMapMode.READ);
      const range = new Uint32Array(gpuReadBuffer.getMappedRange());
      const resultCount = range[0];
      
      if (resultCount > 0) {
        // Collect all potential solutions for batch verification
        const potentialNonces: string[] = [];
        for (let i = 0; i < Math.min(resultCount, 255); i++) {
          const foundLow = range[i * 4 + 1];
          const foundHigh = range[i * 4 + 2];
          const nonceHex = nonceHexForSha256d(foundLow, foundHigh);
          potentialNonces.push(nonceHex);
        }

        // Batch verify all solutions
        const { verified } = batchVerifySha256d(currentWork.target, midstate.preimage, potentialNonces);
        
        for (const nonceHex of verified) {
          console.log(`64-bit SHA256d solution verified: ${nonceHex}`);
          foundNonce(nonceHex);
          addMessage({ type: "found", nonce: nonceHex });
          found.value++;
        }
      }
      
      gpuReadBuffer.unmap();
      nonceLow += numInvocations;
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > 0) {
        const totalHashes = (BigInt(nonceHigh) << 32n) + BigInt(nonceLow);
        hashrate.value = Number((totalHashes * 1000n) / BigInt(elapsedMs));
      }

      // @ts-expect-error doesn't matter
      if (miningStatus.value === "change") {
        updateWork();
        console.debug("Changing work for 64-bit SHA256d");
        if (!workSignal.value) { console.debug("Invalid work"); break; }
        currentWork = workSignal.value;
        reseedRound = 0;
        midstate = powMidstate(currentWork);
        device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);
        nonceLow = 0;
        nonceHigh = 0;
        miningStatus.value = "mining";
      }
    }
  } else {
    // V1 layout: 3 bindings (midstate/nonce/result) — SHA256d
    const midstateBuffer = device.createBuffer({
      label: "midstate buffer", size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const resultBufferSize = 4;
    const resultBuffer = device.createBuffer({
      label: "pow result", size: resultBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const nonceBuffer = device.createBuffer({
      label: "nonce buffer", size: 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      label: "pow bindGroup",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: midstateBuffer } },
        { binding: 1, resource: { buffer: nonceBuffer } },
        { binding: 2, resource: { buffer: resultBuffer } },
      ],
    });

    const gpuReadBuffer = device.createBuffer({
      size: resultBufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    let nonceStart = 0;
    let startTime = Date.now();
    const maxNonce = NONCE_SPACE_SIZE - numInvocations;

    device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);

    while (miningStatus.value === "mining" || miningStatus.value === "change") {
      if (nonceStart > maxNonce) {
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > 0 && nonceStart > 0) {
          hashrate.value = (nonceStart / elapsedMs) * 1000;
        }

        const reseededWork = tryAutoReseedWork();
        if (reseededWork) {
          currentWork = reseededWork;
          midstate = powMidstate(currentWork);
          device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);
          nonceStart = 0;
          startTime = Date.now();
          continue;
        }

        stopAfterNonceSpaceExhausted(algorithm);
        break;
      }
      device.queue.writeBuffer(
        nonceBuffer, 0, new Uint32Array([0, nonceStart])
      );

      const encoder = device.createCommandEncoder({ label: "pow encoder" });
      const pass = encoder.beginComputePass({ label: "pow compute pass" });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(numWorkgroups);
      pass.end();
      encoder.copyBufferToBuffer(resultBuffer, 0, gpuReadBuffer, 0, resultBufferSize);
      device.queue.submit([encoder.finish()]);

      await gpuReadBuffer.mapAsync(GPUMapMode.READ);
      const range = new Uint8Array(gpuReadBuffer.getMappedRange());
      const result = bytesToHex(range.slice(0, 4));
      if (result !== "00000000") {
        const nonceHex = swapEndianness(result);
        if (verify(currentWork.target, midstate.preimage, nonceHex)) {
          console.log("Verified", nonceHex);
          foundNonce(nonceHex);
          addMessage({ type: "found", nonce: nonceHex });
          found.value++;
        }
      }
      device.queue.writeBuffer(resultBuffer, 0, new Uint32Array([0]));
      gpuReadBuffer.unmap();
      nonceStart += numInvocations;
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > 0 && nonceStart > 0) {
        hashrate.value = (nonceStart / elapsedMs) * 1000;
      }

      // @ts-expect-error doesn't matter
      if (miningStatus.value === "change") {
        updateWork();
        console.debug("Changing work");
        if (!workSignal.value) { console.debug("Invalid work"); break; }
        currentWork = workSignal.value;
        reseedRound = 0;
        midstate = powMidstate(currentWork);
        device.queue.writeBuffer(midstateBuffer, 0, midstate.hash);
        miningStatus.value = "mining";
      }
    }
  }

  hashrate.value = 0;
  miningStatus.value = "ready";
  console.log("State ready");
};

export default { start, stop };
export { batchVerifySha256d, verifySha256d64 };
