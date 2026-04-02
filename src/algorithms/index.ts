// Algorithm registry and loader

import { AlgorithmId, AlgorithmConfig } from './types';
import { sha256dConfig } from './sha256d';
import { blake3Config } from './blake3';
import { k12Config } from './k12';
import { argon2lightConfig } from './argon2light';

// Registry of all available algorithms
export const ALGORITHM_CONFIGS: Partial<Record<AlgorithmId, AlgorithmConfig>> = {
  sha256d: sha256dConfig,
  blake3: blake3Config,
  k12: k12Config, // Phase 2: KangarooTwelve added
  argon2light: argon2lightConfig, // Phase 3: Argon2id-Light added
};

// Get algorithm configuration by ID
export function getAlgorithmConfig(id: AlgorithmId): AlgorithmConfig | null {
  return ALGORITHM_CONFIGS[id] || null;
}

// Get all available algorithms
export function getAvailableAlgorithms(): AlgorithmId[] {
  return Object.keys(ALGORITHM_CONFIGS) as AlgorithmId[];
}

// Check if algorithm is supported
export function isAlgorithmSupported(id: AlgorithmId): boolean {
  return id in ALGORITHM_CONFIGS;
}
