import type { DAACalculator, ContractState, DAAParams } from './types';

// Fixed difficulty - never changes
export class FixedDAA implements DAACalculator {
  calculateNextDifficulty(
    currentState: ContractState,
    _newBlockHeight: number,
    _newBlockTime: number
  ): bigint {
    // Fixed difficulty never changes
    return currentState.currentDifficulty;
  }
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    _params: DAAParams
  ): ContractState {
    return {
      currentDifficulty: initialDifficulty,
      lastBlockHeight: initialHeight,
      lastBlockTime: initialTime,
      daaMode: 'fixed',
      daaParams: {},
    };
  }
  
  validateParams(_params: DAAParams): boolean {
    // Fixed difficulty doesn't need any parameters
    return true;
  }
}

// Epoch-based difficulty adjustment (Bitcoin-style)
export class EpochDAA implements DAACalculator {
  private epochLength: number;
  private maxAdjustment: number;
  private targetBlockTime: number;
  private static readonly PRECISION = 1000000n; // Fixed-point precision
  
  constructor(params: DAAParams) {
    this.epochLength = params.epochLength || 2016; // Default: 2016 blocks (~2 weeks)
    this.maxAdjustment = params.maxAdjustment || 4; // Default: 4x adjustment
    this.targetBlockTime = params.targetBlockTime || 600; // Default: 10 minutes
  }
  
  calculateNextDifficulty(
    currentState: ContractState,
    newBlockHeight: number,
    newBlockTime: number
  ): bigint {
    // Only adjust at epoch boundaries
    if (newBlockHeight % this.epochLength !== 0) {
      return currentState.currentDifficulty;
    }
    
    // Calculate actual time vs expected time for the epoch
    const expectedTime = BigInt(this.epochLength * this.targetBlockTime);
    const actualTime = BigInt(newBlockTime - currentState.lastBlockTime);
    
    // Prevent division by zero
    if (actualTime === 0n) {
      return currentState.currentDifficulty;
    }
    
    // Calculate adjustment factor using fixed-point arithmetic
    // adjustment = expectedTime / actualTime (inverted because higher time = lower difficulty)
    let adjustmentScaled = expectedTime * EpochDAA.PRECISION / actualTime;
    
    // Clamp adjustment to maxAdjustment using fixed-point
    const maxAdjustmentScaled = BigInt(this.maxAdjustment) * EpochDAA.PRECISION;
    const minAdjustmentScaled = EpochDAA.PRECISION / BigInt(this.maxAdjustment);
    
    if (adjustmentScaled > maxAdjustmentScaled) {
      adjustmentScaled = maxAdjustmentScaled;
    } else if (adjustmentScaled < minAdjustmentScaled) {
      adjustmentScaled = minAdjustmentScaled;
    }
    
    // Apply adjustment with fixed-point division
    const newDifficulty = currentState.currentDifficulty * adjustmentScaled / EpochDAA.PRECISION;
    
    // Ensure minimum difficulty of 1
    return newDifficulty > 0n ? newDifficulty : 1n;
  }
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    params: DAAParams
  ): ContractState {
    return {
      currentDifficulty: initialDifficulty,
      lastBlockHeight: initialHeight,
      lastBlockTime: initialTime,
      daaMode: 'epoch',
      daaParams: params,
    };
  }
  
  validateParams(params: DAAParams): boolean {
    return (
      (params.epochLength || 2016) > 0 &&
      (params.maxAdjustment || 4) > 0 &&
      (params.targetBlockTime || 600) > 0
    );
  }
}

// Linear Weighted Moving Average (LWMA)
// Properly weights recent blocks more heavily than older blocks
export class LWMADAA implements DAACalculator {
  private windowSize: number;
  private targetBlockTime: number;
  private static readonly PRECISION = 1000000n;
  
  constructor(params: DAAParams) {
    this.windowSize = params.windowSize || 144; // Default: 144 blocks
    this.targetBlockTime = params.targetBlockTime || 60; // Default: 1 minute
  }
  
  calculateNextDifficulty(
    currentState: ContractState,
    _newBlockHeight: number,
    _newBlockTime: number
  ): bigint {
    if (!currentState.blockTimes || currentState.blockTimes.length < 2) {
      return currentState.currentDifficulty;
    }
    
    const blockTimes = currentState.blockTimes;
    const n = Math.min(blockTimes.length - 1, this.windowSize);
    
    if (n < 1) {
      return currentState.currentDifficulty;
    }
    
    // Calculate weighted sum of solve times
    // Weight = position in window (more recent = higher weight)
    let weightedSolveTimeSum = 0n;
    let weightSum = 0n;
    
    const startIndex = Math.max(0, blockTimes.length - n - 1);
    
    for (let i = 0; i < n; i++) {
      const solveTime = blockTimes[startIndex + i + 1] - blockTimes[startIndex + i];
      // Clamp solve time to prevent extreme values (max 6x target)
      const clampedSolveTime = Math.min(Math.max(solveTime, 1), this.targetBlockTime * 6);
      const weight = BigInt(i + 1); // Linear weight: 1, 2, 3, ..., n
      
      weightedSolveTimeSum += BigInt(clampedSolveTime) * weight;
      weightSum += weight;
    }
    
    // Prevent division by zero
    if (weightSum === 0n || weightedSolveTimeSum === 0n) {
      return currentState.currentDifficulty;
    }
    
    // Calculate weighted average solve time
    const weightedAvgSolveTime = weightedSolveTimeSum / weightSum;
    const targetTime = BigInt(this.targetBlockTime);
    
    // Calculate adjustment: target / actual (inverted for difficulty)
    // Using fixed-point arithmetic for precision
    const adjustmentScaled = targetTime * LWMADAA.PRECISION / weightedAvgSolveTime;
    
    // Clamp adjustment to prevent extreme changes (max 3x change per block)
    const maxAdjustment = 3n * LWMADAA.PRECISION;
    const minAdjustment = LWMADAA.PRECISION / 3n;
    
    let clampedAdjustment = adjustmentScaled;
    if (clampedAdjustment > maxAdjustment) {
      clampedAdjustment = maxAdjustment;
    } else if (clampedAdjustment < minAdjustment) {
      clampedAdjustment = minAdjustment;
    }
    
    // Apply adjustment
    const newDifficulty = currentState.currentDifficulty * clampedAdjustment / LWMADAA.PRECISION;
    
    // Ensure minimum difficulty of 1
    return newDifficulty > 0n ? newDifficulty : 1n;
  }
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    params: DAAParams
  ): ContractState {
    return {
      currentDifficulty: initialDifficulty,
      lastBlockHeight: initialHeight,
      lastBlockTime: initialTime,
      daaMode: 'lwma',
      daaParams: params,
      blockTimes: [initialTime],
      difficulties: [initialDifficulty],
    };
  }
  
  validateParams(params: DAAParams): boolean {
    return (
      (params.windowSize || 144) > 0 &&
      (params.targetBlockTime || 60) > 0
    );
  }
}

// ASERT (Absolutely Scheduled Exponentially Rising Target)
// Uses fixed-point arithmetic for deterministic calculations across implementations
export class ASERTDAA implements DAACalculator {
  private halfLife: number;
  private targetBlockTime: number;
  private asymptote: number;
  
  // Fixed-point precision: 2^16 for integer arithmetic
  private static readonly RBITS = 16n;
  private static readonly RADIX = 1n << ASERTDAA.RBITS;
  
  constructor(params: DAAParams) {
    this.halfLife = params.halfLife || 1000; // Default: 1000 blocks
    this.targetBlockTime = params.targetBlockTime || 60; // Default: 1 minute
    this.asymptote = params.asymptote || 0; // Default: no asymptote
  }
  
  // Fixed-point exponential approximation using Taylor series
  // exp(x) ≈ 1 + x + x²/2 + x³/6 for small x
  private static fixedPointExp(exponent: bigint): bigint {
    // For very small exponents, use linear approximation
    // exp(x) ≈ 1 + x for |x| << 1
    const one = ASERTDAA.RADIX;
    
    // Clamp extreme values
    const maxExp = 4n * one; // ~e^4 ≈ 54x max adjustment
    const minExp = -4n * one;
    
    let x = exponent;
    if (x > maxExp) x = maxExp;
    if (x < minExp) x = minExp;
    
    // Taylor series: 1 + x + x²/2 + x³/6
    const x2 = (x * x) >> ASERTDAA.RBITS;
    const x3 = (x2 * x) >> ASERTDAA.RBITS;
    
    return one + x + (x2 >> 1n) + (x3 / 6n);
  }
  
  calculateNextDifficulty(
    currentState: ContractState,
    newBlockHeight: number,
    newBlockTime: number
  ): bigint {
    if (!currentState.asertState) {
      return currentState.currentDifficulty;
    }
    
    const { timeStarted } = currentState.asertState;
    
    // Calculate time and height deltas
    const timeDelta = BigInt(newBlockTime - timeStarted);
    const heightDelta = BigInt(newBlockHeight - currentState.lastBlockHeight);
    
    // Prevent division by zero
    if (heightDelta <= 0n) {
      return currentState.currentDifficulty;
    }
    
    const expectedTime = heightDelta * BigInt(this.targetBlockTime);
    
    // Calculate exponent for ASERT formula using fixed-point
    // exponent = ln(2) * (actualTime - expectedTime) / (halfLife * targetBlockTime)
    // Using fixed-point: exponent = (timeDelta - expectedTime) * RADIX * ln2_scaled / (halfLife * targetTime)
    
    // ln(2) ≈ 0.693147... scaled by RADIX
    const ln2Scaled = 45426n; // ln(2) * 65536
    const halfLifeScaled = BigInt(this.halfLife) * BigInt(this.targetBlockTime);
    
    // Calculate deviation from expected time
    const timeDeviation = timeDelta - expectedTime;
    
    // Calculate exponent in fixed-point
    const exponent = (timeDeviation * ln2Scaled) / halfLifeScaled;
    
    // Calculate adjustment factor using fixed-point exponential
    const adjustmentScaled = ASERTDAA.fixedPointExp(exponent);
    
    // Apply adjustment
    let newDifficulty = (currentState.currentDifficulty * adjustmentScaled) >> ASERTDAA.RBITS;
    
    // Ensure minimum difficulty of 1
    if (newDifficulty < 1n) {
      newDifficulty = 1n;
    }
    
    // Apply asymptote if specified (soft cap on difficulty)
    if (this.asymptote > 0) {
      const asymptoteDiff = BigInt(this.asymptote);
      if (newDifficulty > asymptoteDiff) {
        // Smooth approach to asymptote
        newDifficulty = asymptoteDiff + (newDifficulty - asymptoteDiff) / 2n;
      }
    }
    
    return newDifficulty;
  }
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    params: DAAParams
  ): ContractState {
    return {
      currentDifficulty: initialDifficulty,
      lastBlockHeight: initialHeight,
      lastBlockTime: initialTime,
      daaMode: 'asert',
      daaParams: params,
      asertState: {
        timeStarted: initialTime,
        bits: 0, // Not used in fixed-point implementation
      },
    };
  }
  
  validateParams(params: DAAParams): boolean {
    return (
      (params.halfLife || 1000) > 0 &&
      (params.targetBlockTime || 60) > 0 &&
      (params.asymptote || 0) >= 0
    );
  }
}

// Schedule-based difficulty adjustment
export class ScheduleDAA implements DAACalculator {
  private schedule: Array<{height: number, difficulty: number}>;
  
  constructor(params: DAAParams) {
    this.schedule = params.schedule || [];
  }
  
  calculateNextDifficulty(
    currentState: ContractState,
    newBlockHeight: number,
    _newBlockTime: number
  ): bigint {
    // Find the appropriate difficulty for the current height
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      if (newBlockHeight >= this.schedule[i].height) {
        return BigInt(this.schedule[i].difficulty);
      }
    }
    
    // If no schedule entry matches, return current difficulty
    return currentState.currentDifficulty;
  }
  
  initializeState(
    initialDifficulty: bigint,
    initialHeight: number,
    initialTime: number,
    params: DAAParams
  ): ContractState {
    return {
      currentDifficulty: initialDifficulty,
      lastBlockHeight: initialHeight,
      lastBlockTime: initialTime,
      daaMode: 'schedule',
      daaParams: params,
    };
  }
  
  validateParams(params: DAAParams): boolean {
    if (!params.schedule || params.schedule.length === 0) {
      return false;
    }
    
    // Check that schedule is sorted by height and has valid difficulties
    for (let i = 0; i < params.schedule.length; i++) {
      if (params.schedule[i].height < 0 || params.schedule[i].difficulty <= 0) {
        return false;
      }
      if (i > 0 && params.schedule[i].height <= params.schedule[i - 1].height) {
        return false;
      }
    }
    
    return true;
  }
}
