import type { DAACalculator, DAAMode, DAAParams, ContractState } from './types';
import { 
  FixedDAA, 
  EpochDAA, 
  LWMADAA, 
  ASERTDAA, 
  ScheduleDAA 
} from './calculators';

// DAA Calculator registry
export class DAARegistry {
  private static calculators: Map<DAAMode, (params: DAAParams) => DAACalculator> = new Map([
    ['fixed', (_params) => new FixedDAA()],
    ['epoch', (params) => new EpochDAA(params)],
    ['lwma', (params) => new LWMADAA(params)],
    ['asert', (params) => new ASERTDAA(params)],
    ['schedule', (params) => new ScheduleDAA(params)],
  ]);
  
  static getCalculator(mode: DAAMode, params: DAAParams): DAACalculator {
    const factory = this.calculators.get(mode);
    if (!factory) {
      throw new Error(`Unsupported DAA mode: ${mode}`);
    }
    return factory(params);
  }
  
  static validateParams(mode: DAAMode, params: DAAParams): boolean {
    const calculator = this.getCalculator(mode, params);
    return calculator.validateParams(params);
  }
  
  static getSupportedModes(): DAAMode[] {
    return Array.from(this.calculators.keys());
  }
}

// DAA Manager - high-level interface for difficulty adjustment
export class DAAManager {
  private calculator: DAACalculator;
  private state: ContractState;
  
  constructor(
    mode: DAAMode,
    params: DAAParams,
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number
  ) {
    this.calculator = DAARegistry.getCalculator(mode, params);
    this.state = this.calculator.initializeState(
      initialDifficulty,
      initialHeight,
      initialTime,
      params
    );
  }
  
  // Calculate next difficulty based on new block
  calculateNextDifficulty(
    newBlockHeight: number,
    newBlockTime: number,
    solveTime?: number
  ): bigint {
    const newDifficulty = this.calculator.calculateNextDifficulty(
      this.state,
      newBlockHeight,
      newBlockTime,
      solveTime
    );
    
    // Update state
    this.state.currentDifficulty = newDifficulty;
    this.state.lastBlockHeight = newBlockHeight;
    this.state.lastBlockTime = newBlockTime;
    
    // Update historical data if needed
    const maxHistorySize = 1000; // Keep last 1000 blocks
    
    if (this.state.blockTimes) {
      this.state.blockTimes.push(newBlockTime);
      // Keep only recent history
      if (this.state.blockTimes.length > maxHistorySize) {
        this.state.blockTimes = this.state.blockTimes.slice(-maxHistorySize);
      }
    }
    
    if (this.state.difficulties) {
      this.state.difficulties.push(newDifficulty);
      if (this.state.difficulties.length > maxHistorySize) {
        this.state.difficulties = this.state.difficulties.slice(-maxHistorySize);
      }
    }
    
    return newDifficulty;
  }
  
  // Get current state
  getState(): ContractState {
    return { ...this.state };
  }
  
  // Update state (for loading from contract)
  updateState(newState: ContractState): void {
    this.state = { ...newState };
    // Recreate calculator with new parameters
    this.calculator = DAARegistry.getCalculator(
      newState.daaMode,
      newState.daaParams
    );
  }
  
  // Validate current parameters
  validateCurrentParams(): boolean {
    return this.calculator.validateParams(this.state.daaParams);
  }
  
  // Get difficulty statistics
  getDifficultyStats(): {
    current: bigint;
    average: bigint;
    min: bigint;
    max: bigint;
    blockCount: number;
  } {
    const difficulties = this.state.difficulties || [this.state.currentDifficulty];
    
    const sum = difficulties.reduce((acc, diff) => acc + diff, 0n);
    const average = sum / BigInt(difficulties.length);
    const min = difficulties.reduce((acc, diff) => (diff < acc ? diff : acc), difficulties[0]);
    const max = difficulties.reduce((acc, diff) => (diff > acc ? diff : acc), difficulties[0]);
    
    return {
      current: this.state.currentDifficulty,
      average,
      min,
      max,
      blockCount: difficulties.length,
    };
  }
  
  // Estimate next difficulty (for UI preview)
  estimateNextDifficulty(
    expectedSolveTime: number,
    currentTime: number
  ): bigint {
    // Use current state + expected time to estimate
    return this.calculator.calculateNextDifficulty(
      this.state,
      this.state.lastBlockHeight + 1,
      currentTime + expectedSolveTime,
      expectedSolveTime
    );
  }
}

// Utility functions for DAA operations
export function createDAAManager(
  mode: DAAMode,
  params: DAAParams,
  initialDifficulty: bigint,
  initialHeight: number = 0,
  initialTime: number = Date.now()
): DAAManager {
  return new DAAManager(mode, params, initialDifficulty, initialHeight, initialTime);
}

export function getDefaultDAAParams(mode: DAAMode): DAAParams {
  switch (mode) {
    case 'fixed':
      return {};
    case 'epoch':
      return {
        targetBlockTime: 60,
        epochLength: 2016,
        maxAdjustment: 4,
      };
    case 'lwma':
      return {
        targetBlockTime: 60,
        windowSize: 144,
      };
    case 'asert':
      return {
        targetBlockTime: 60,
        halfLife: 1000,
        asymptote: 0,
      };
    case 'schedule':
      return {
        schedule: [
          { height: 0, difficulty: 1000 },
          { height: 1000, difficulty: 500 },
          { height: 2000, difficulty: 250 },
        ],
      };
    default:
      return {};
  }
}

export function validateDAAConfig(mode: DAAMode, params: DAAParams): string | null {
  try {
    const calculator = DAARegistry.getCalculator(mode, params);
    if (!calculator.validateParams(params)) {
      return `Invalid parameters for ${mode} DAA mode`;
    }
    return null;
  } catch (error) {
    return `Error creating ${mode} DAA calculator: ${error}`;
  }
}

// Export all DAA-related types and utilities
export * from './types';
export * from './calculators';
