import { AlgorithmConfig } from './types';
// Note: Shader will be loaded directly in miner.ts

export const argon2lightConfig: AlgorithmConfig = {
  id: 'argon2light',
  shaderCode: '', // Will be loaded dynamically
  workgroupSize: 128,
  bufferRequirements: {
    midstate: 128, // 128 u32s for Argon2 block
    target: 4,     // 4 u32s for target (vec4<u32>)
    results: 128,   // 128 vec4<u32>s for results
    memory: 1024,  // 1024 Argon2 blocks for working memory
  },
};

export function prepareArgon2LightWork(work: any): Uint8Array {
  // Create initial Argon2 block from work data
  const block = new Uint32Array(128);
  
  // Initialize with work data
  const workData = new TextEncoder().encode(JSON.stringify(work));
  const dataView = new DataView(workData.buffer);
  
  // Fill block with work data (first 512 bytes)
  for (let i = 0; i < Math.min(128, workData.length / 4); i++) {
    block[i] = dataView.getUint32(i * 4, true);
  }
  
  // Add Argon2id-Light parameters to block
  block[0] ^= 0x13; // Argon2id version
  block[1] ^= 3;    // Time cost
  block[2] ^= 1024; // Memory size
  block[3] ^= 4;    // Parallelism
  
  // Add padding if needed
  for (let i = workData.length / 4; i < 128; i++) {
    block[i] = 0;
  }
  
  return new Uint8Array(block.buffer);
}

// Simplified Argon2id-Light verification
export function verifyArgon2LightSolution(work: any, nonce: string): boolean {
  try {
    // Prepare input data
    const workData = typeof work === 'string' ? work : JSON.stringify(work);
    const input = new TextEncoder().encode(workData + nonce);
    
    // Simplified Argon2 hash
    const hash = simplifiedArgon2Hash(input);
    
    // Check if hash meets target (first 4 bytes must be zero for basic verification)
    return hash[0] === 0 && hash[1] === 0 && hash[2] === 0 && hash[3] === 0;
  } catch (error) {
    console.error('Argon2 verification error:', error);
    return false;
  }
}

// Simplified Argon2 hash implementation (memory-light version)
function simplifiedArgon2Hash(input: Uint8Array): Uint8Array {
  // Initialize state (16 x 32-bit words)
  const state = new Uint32Array(16);
  
  // Initialize with input
  for (let i = 0; i < Math.min(input.length, 64); i++) {
    const wordIdx = Math.floor(i / 4);
    const byteIdx = i % 4;
    state[wordIdx] ^= input[i] << (byteIdx * 8);
  }
  
  // Add Argon2id parameters
  state[0] ^= 0x13; // Version
  state[1] ^= 3;    // Time cost
  state[2] ^= 64;   // Memory (reduced)
  state[3] ^= 4;    // Parallelism
  
  // Memory array (simplified - much smaller than real Argon2)
  const memory = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    memory[i] = state[i];
  }
  
  // Time cost iterations
  for (let t = 0; t < 3; t++) {
    // Mix state with memory using Blake2b-style compression
    for (let i = 0; i < 16; i++) {
      const refIdx = (state[i] + t) % 16;
      state[i] ^= memory[refIdx];
    }
    
    // Blake2b-style compression rounds
    blake2bCompress(state, memory);
    
    // Update memory
    for (let i = 0; i < 16; i++) {
      memory[i] ^= state[i];
    }
  }
  
  // Final compression
  blake2bCompress(state, memory);
  
  // Extract hash (32 bytes)
  const output = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const word = state[i] ^ state[i + 8];
    output[i * 4] = word & 0xff;
    output[i * 4 + 1] = (word >> 8) & 0xff;
    output[i * 4 + 2] = (word >> 16) & 0xff;
    output[i * 4 + 3] = (word >> 24) & 0xff;
  }
  
  return output;
}

// Blake2b-style compression for Argon2
function blake2bCompress(state: Uint32Array, msg: Uint32Array): void {
  // G function for Blake2b
  const g = (a: number, b: number, c: number, d: number, x: number, y: number) => {
    state[a] = (state[a] + state[b] + x) >>> 0;
    state[d] = rotr32(state[d] ^ state[a], 16);
    state[c] = (state[c] + state[d]) >>> 0;
    state[b] = rotr32(state[b] ^ state[c], 12);
    state[a] = (state[a] + state[b] + y) >>> 0;
    state[d] = rotr32(state[d] ^ state[a], 8);
    state[c] = (state[c] + state[d]) >>> 0;
    state[b] = rotr32(state[b] ^ state[c], 7);
  };
  
  // Column rounds
  g(0, 4, 8, 12, msg[0], msg[1]);
  g(1, 5, 9, 13, msg[2], msg[3]);
  g(2, 6, 10, 14, msg[4], msg[5]);
  g(3, 7, 11, 15, msg[6], msg[7]);
  
  // Diagonal rounds
  g(0, 5, 10, 15, msg[8], msg[9]);
  g(1, 6, 11, 12, msg[10], msg[11]);
  g(2, 7, 8, 13, msg[12], msg[13]);
  g(3, 4, 9, 14, msg[14], msg[15]);
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

export function getArgon2LightMemoryRequirements(): {
  minMemoryMB: number;
  recommendedMemoryMB: number;
  maxMemoryMB: number;
} {
  return {
    minMemoryMB: 64,    // Minimum for low-end GPUs
    recommendedMemoryMB: 256, // Recommended for good performance
    maxMemoryMB: 512,  // Maximum to prevent OOM
  };
}

export function checkGPUMemoryCompatibility(memoryMB: number): {
  compatible: boolean;
  recommended: boolean;
  warning?: string;
} {
  const { minMemoryMB, recommendedMemoryMB, maxMemoryMB } = getArgon2LightMemoryRequirements();
  
  if (memoryMB < minMemoryMB) {
    return {
      compatible: false,
      recommended: false,
      warning: `GPU has insufficient memory. Required: ${minMemoryMB}MB, Available: ${memoryMB}MB`
    };
  }
  
  if (memoryMB < recommendedMemoryMB) {
    return {
      compatible: true,
      recommended: false,
      warning: `GPU memory is below recommended. Recommended: ${recommendedMemoryMB}MB, Available: ${memoryMB}MB`
    };
  }
  
  if (memoryMB > maxMemoryMB) {
    return {
      compatible: true,
      recommended: true,
      warning: `GPU has excessive memory. Consider reducing memory parameter for better performance.`
    };
  }
  
  return {
    compatible: true,
    recommended: true
  };
}

export function getArgon2LightMiningStats(difficulty: number, memoryMB: number): {
  estimatedHashrate: number;
  powerConsumption: number;
  efficiency: number;
  memoryUtilization: number;
} {
  // Argon2id-Light is memory-bound, so hashrate depends on memory size
  const baseHashrate = 5000000; // 5 MH/s baseline at 256MB
  const memoryFactor = memoryMB / 256;
  const difficultyFactor = Math.max(0.1, Math.min(10, 50000 / difficulty));
  
  return {
    estimatedHashrate: Math.floor(baseHashrate * memoryFactor * difficultyFactor),
    powerConsumption: Math.floor(150 * memoryFactor), // Scales with memory usage
    efficiency: Math.floor(baseHashrate * difficultyFactor / (150 * memoryFactor)), // H/W
    memoryUtilization: Math.min(100, (1024 / memoryMB) * 100), // Percentage of memory used
  };
}
