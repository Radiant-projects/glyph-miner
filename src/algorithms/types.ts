// Algorithm types and interfaces for Glyph mining

export type AlgorithmId = 'sha256d' | 'blake3' | 'k12' | 'argon2light' | 'randomx-light';

export interface MiningAlgorithm {
  id: AlgorithmId;
  name: string;
  description: string;
  memoryRequirement: number; // in MB
  gpuFriendly: boolean;
  recommended: boolean;
}

export interface AlgorithmConfig {
  id: AlgorithmId;
  shaderCode: string;
  workgroupSize: number;
  bufferRequirements: {
    midstate: number; // in u32s
    target: number;   // in u32s
    results: number;  // in vec4<u32>s
    memory?: number;  // in blocks (for memory-intensive algorithms)
  };
}

export const ALGORITHMS: Record<AlgorithmId, MiningAlgorithm> = {
  sha256d: {
    id: 'sha256d',
    name: 'SHA256d',
    description: 'Original SHA256d algorithm, backward compatible',
    memoryRequirement: 0.001, // ~1 KB
    gpuFriendly: true,
    recommended: false, // Not recommended for new contracts
  },
  blake3: {
    id: 'blake3',
    name: 'Blake3',
    description: 'High-performance, GPU-friendly algorithm',
    memoryRequirement: 0.001, // ~1 KB
    gpuFriendly: true,
    recommended: true, // Primary recommendation for new contracts
  },
  k12: {
    id: 'k12',
    name: 'KangarooTwelve',
    description: 'Keccak-based algorithm, good CPU/GPU balance',
    memoryRequirement: 0.0002, // ~200 B
    gpuFriendly: true,
    recommended: true, // Phase 3 implementation
  },
  argon2light: {
    id: 'argon2light',
    name: 'Argon2id-Light',
    description: 'Memory-hard algorithm, levels playing field',
    memoryRequirement: 64, // 64 MB minimum
    gpuFriendly: true,
    recommended: true, // Phase 3 implementation
  },
  'randomx-light': {
    id: 'randomx-light',
    name: 'RandomX-Light',
    description: 'CPU-friendly RandomX variant for JavaScript',
    memoryRequirement: 0.256, // 256 KB
    gpuFriendly: false,
    recommended: false, // CPU-only algorithm
  },
};

// Recommended minimum difficulties to prevent collisions
export const RECOMMENDED_MIN_DIFFICULTY: Record<AlgorithmId, number> = {
  sha256d: 500000,
  blake3: 2500000,
  k12: 50000,
  argon2light: 10000,
  'randomx-light': 50000,
};

// Expected hashrates on RTX 4090 (hashes/second)
export const REFERENCE_HASHRATES: Record<AlgorithmId, number> = {
  sha256d: 1500000000, // 1.5 GH/s
  blake3: 7500000000,  // 7.5 GH/s
  k12: 4000000000,     // 4.0 GH/s
  argon2light: 50000000, // 50 MH/s (memory-bound)
  'randomx-light': 50000, // 50 KH/s (CPU-only)
};

// Calculate estimated time to mine
export function calcTimeToMine(difficulty: number, algorithm: AlgorithmId, hashrate?: number): number {
  // Guard against division by zero
  if (difficulty <= 0) {
    return Infinity;
  }
  
  const refHashrate = hashrate || REFERENCE_HASHRATES[algorithm];
  if (refHashrate <= 0) {
    return Infinity;
  }
  
  const maxTarget = 0x7fffffffffffffffn; // From pow.ts
  const target = maxTarget / BigInt(difficulty);
  
  // Guard against target being zero (shouldn't happen with valid difficulty)
  if (target === 0n) {
    return Infinity;
  }
  
  // 33 bits (4 bytes + 1 bit to make the next 64 bit number unsigned)
  return Math.round(
    (Number(maxTarget / target) * Math.pow(2, 33)) / refHashrate
  );
}

// Check if difficulty is above recommended minimum
export function isDifficultyRecommended(difficulty: number, algorithm: AlgorithmId): boolean {
  return difficulty >= RECOMMENDED_MIN_DIFFICULTY[algorithm];
}

// Get collision warning message
export function getCollisionWarning(difficulty: number, algorithm: AlgorithmId): string | null {
  if (isDifficultyRecommended(difficulty, algorithm)) {
    return null;
  }
  
  const timeToMine = calcTimeToMine(difficulty, algorithm);
  const expectedMiners = Math.max(1, Math.floor(60 / timeToMine)); // Assuming 60s target
  
  if (expectedMiners <= 1) {
    return null;
  }
  
  const collisionRate = Math.min(0.5, (expectedMiners - 1) / expectedMiners);
  
  return `⚠️ Low difficulty may result in ~${Math.round(collisionRate * 100)}% of solutions being orphaned due to collisions with other miners.` +
         ` Expected time to mine: ${timeToMine}s on RTX 4090.`;
}
