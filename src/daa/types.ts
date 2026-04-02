import type { AlgorithmId } from '../algorithms/types';

export type DAAMode = 'fixed' | 'epoch' | 'asert' | 'lwma' | 'schedule';

export interface DAAParams {
  // Common parameters
  targetBlockTime?: number; // Target time between blocks in seconds
  
  // ASERT parameters
  halfLife?: number;        // Half-life for ASERT in blocks
  asymptote?: number;       // Asymptote for ASERT
  
  // LWMA parameters  
  windowSize?: number;      // Window size for LWMA in blocks
  
  // Epoch parameters
  epochLength?: number;     // Blocks per epoch
  maxAdjustment?: number;   // Maximum adjustment factor
  
  // Schedule parameters
  schedule?: Array<{height: number, difficulty: number}>; // Height-difficulty pairs
}

export interface ContractState {
  // Current difficulty state
  currentDifficulty: bigint;
  lastBlockHeight: number;
  lastBlockTime: number;     // Timestamp of last block
  
  // DAA-specific state
  daaMode: DAAMode;
  daaParams: DAAParams;
  
  // Historical data for DAA calculations
  blockTimes?: number[];     // Recent block times
  difficulties?: bigint[];  // Recent difficulties
  
  // ASERT state
  asertState?: {
    timeStarted: number;
    bits: number;
  };
  
  // LWMA state
  lwmaState?: {
    sumTargetTimes: bigint;
    sumActualTimes: bigint;
    previousTime: number;
  };
}

export interface DAACalculator {
  calculateNextDifficulty(
    currentState: ContractState,
    newBlockHeight: number,
    newBlockTime: number,
    solveTime?: number
  ): bigint;
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    params: DAAParams
  ): ContractState;
  
  validateParams(params: DAAParams): boolean;
}

export interface MiningResult {
  nonce: string;
  hash: string;
  algorithm: AlgorithmId;
  difficulty: bigint;
  blockHeight: number;
  blockTime: number;
  solveTime: number;
}

// Utility functions for DAA
export function encodeDAAParams(mode: DAAMode, params: DAAParams): string {
  // Encode DAA parameters for contract script
  switch (mode) {
    case 'fixed':
      return ''; // No parameters needed for fixed
    case 'asert':
      return `${params.targetBlockTime || 60},${params.halfLife || 1000},${params.asymptote || 0}`;
    case 'lwma':
      return `${params.targetBlockTime || 60},${params.windowSize || 144}`;
    case 'epoch':
      return `${params.targetBlockTime || 60},${params.epochLength || 2016},${params.maxAdjustment || 4}`;
    case 'schedule':
      return params.schedule?.map(pair => `${pair.height}:${pair.difficulty}`).join(',') || '';
    default:
      return '';
  }
}

export function decodeDAAParams(mode: DAAMode, encoded: string): DAAParams {
  // Decode DAA parameters from contract script
  const params: DAAParams = {};
  
  if (!encoded) return params;
  
  switch (mode) {
    case 'asert':
      const [targetBlockTime, halfLife, asymptote] = encoded.split(',').map(Number);
      params.targetBlockTime = targetBlockTime || 60;
      params.halfLife = halfLife || 1000;
      params.asymptote = asymptote || 0;
      break;
      
    case 'lwma':
      const [lwmaTargetTime, windowSize] = encoded.split(',').map(Number);
      params.targetBlockTime = lwmaTargetTime || 60;
      params.windowSize = windowSize || 144;
      break;
      
    case 'epoch':
      const [epochTargetTime, epochLength, maxAdjustment] = encoded.split(',').map(Number);
      params.targetBlockTime = epochTargetTime || 60;
      params.epochLength = epochLength || 2016;
      params.maxAdjustment = maxAdjustment || 4;
      break;
      
    case 'schedule':
      params.schedule = encoded.split(',').map(pair => {
        const [height, difficulty] = pair.split(':').map(Number);
        return { height, difficulty };
      });
      break;
  }
  
  return params;
}

export function getDAAModeId(mode: DAAMode): string {
  // Convert DAA mode to contract byte
  const modeIds: Record<DAAMode, string> = {
    'fixed': '00',
    'epoch': '01', 
    'asert': '02',
    'lwma': '03',
    'schedule': '04'
  };
  return modeIds[mode] || '00';
}

export function parseDAAModeId(modeId: string): DAAMode {
  // Parse DAA mode from contract byte
  const idModes: Record<string, DAAMode> = {
    '00': 'fixed',
    '01': 'epoch',
    '02': 'asert', 
    '03': 'lwma',
    '04': 'schedule'
  };
  return idModes[modeId] || 'fixed';
}

// Difficulty to target conversion
export function difficultyToTarget(difficulty: bigint): bigint {
  const MAX_TARGET = 0x7fffffffffffffffn; // Doesn't include starting 00000000
  return MAX_TARGET / difficulty;
}

export function targetToDifficulty(target: bigint): bigint {
  const MAX_TARGET = 0x7fffffffffffffffn;
  return MAX_TARGET / target;
}

// Target to compact bits (for mining)
export function targetToBits(target: bigint): number {
  // Convert target to compact representation (like Bitcoin)
  const sizeBytes = (target.toString(2).length + 7) / 8;
  const compact = (sizeBytes << 24) | Number(target >> BigInt((sizeBytes - 3) * 8));
  return compact;
}

export function bitsToTarget(bits: number): bigint {
  // Convert compact bits back to target
  const size = bits >> 24;
  const word = bits & 0x00ffffff;
  return BigInt(word) << BigInt((size - 3) * 8);
}
