# Glyph Mining Enhancement PRD

## Product Requirements Document
**Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  

---

## Executive Summary

This document outlines the comprehensive enhancement of the Glyph mining system on Radiant, introducing multiple proof-of-work algorithms and dynamic difficulty adjustment mechanisms. The goal is to create a fairer, more engaging mining experience for home GPU miners while giving token creators flexible options for their tokenomics.

---

## Problem Statement

### Current Limitations

1. **Single Algorithm (SHA256d):** The current POW algorithm competes with Radiant's base layer mining, and is heavily optimized for high-end GPUs/ASICs
2. **Static Difficulty:** Once a contract is created, difficulty never changes, leading to:
   - Tokens that mine out too quickly when hashrate spikes
   - Tokens that become unmintable when difficulty is set too high
   - No mechanism to maintain consistent mint times
3. **No Algorithm Choice:** Token creators have no control over mining characteristics
4. **Single GPU Only:** WebGPU miner limited to one GPU, power users can't utilize multi-GPU setups

### Goals

- **Fairness:** Give home GPU miners a competitive chance against mining farms
- **Flexibility:** Multiple algorithms and DAA options for token creators
- **Engagement:** Make mining more interesting and strategic
- **Accessibility:** Maintain browser-based mining while supporting power users

---

## Technical Specifications

### 1. Proof-of-Work Algorithms

#### 1.1 SHA256d (Existing - Backward Compatible)

```
hash = sha256(sha256(
    sha256(currentLocationTxid + contractRef) +
    sha256(anyInputHash + anyOutputHash) +
    nonce
))
```

| Property | Value |
|----------|-------|
| Algorithm ID | `0x00` |
| Memory | ~1KB |
| GPU Efficiency | Very High |
| WebGPU Support | ✅ Yes |
| Status | **Existing** |

#### 1.2 Blake3 (Primary New Algorithm)

```
hash = blake3(
    blake3(currentLocationTxid + contractRef) +
    blake3(anyInputHash + anyOutputHash) +
    nonce
)
```

| Property | Value |
|----------|-------|
| Algorithm ID | `0x01` |
| Memory | ~1KB |
| GPU Efficiency | Very High |
| WebGPU Support | ✅ Yes |
| Status | **Phase 1** |

**Why Blake3:**
- 3x faster than SHA256 per hash
- No existing ASICs
- Excellent parallelism for consumer GPUs
- Modern cryptographic design
- Simpler to implement than memory-hard alternatives

#### 1.3 KangarooTwelve (K12)

```
hash = k12(
    k12(currentLocationTxid + contractRef) +
    k12(anyInputHash + anyOutputHash) +
    nonce
)
```

| Property | Value |
|----------|-------|
| Algorithm ID | `0x02` |
| Memory | ~200 bytes |
| GPU Efficiency | High |
| WebGPU Support | ✅ Yes |
| Status | **Phase 3** |

**Why K12:**
- SHA-3 family (Keccak-based)
- Optimized for speed
- Different cryptographic foundation than Blake/SHA

#### 1.4 Argon2id-Light (Memory-Hard)

```
hash = argon2id(
    password: sha256(currentLocationTxid + contractRef + anyInputHash + anyOutputHash),
    salt: nonce,
    memory: 64-256MB (configurable),
    iterations: 1-3 (configurable),
    parallelism: 1
)
```

| Property | Value |
|----------|-------|
| Algorithm ID | `0x03` |
| Memory | 64-256MB (configurable) |
| GPU Efficiency | Medium (intentionally) |
| WebGPU Support | ✅ Yes (with constraints) |
| Status | **Phase 3** |

**Why Argon2id-Light:**
- ASIC-resistant by design
- Memory-hard levels the playing field
- 64MB minimum fits WebGPU buffer limits
- Disadvantages mining farms with specialized hardware

#### 1.5 RandomX-Light (CPU-Only, Future)

| Property | Value |
|----------|-------|
| Algorithm ID | `0x04` |
| Memory | 256MB |
| GPU Efficiency | Very Low (CPU wins) |
| WebGPU Support | ❌ No (CLI only) |
| Status | **Future Phase** |

**Note:** Requires standalone CLI miner. Deferred to future roadmap.

---

### 2. Difficulty Adjustment Algorithms (DAA)

#### 2.1 Fixed (Mode 0) - Current Behavior

```typescript
function calculateTarget(params: FixedDAA): bigint {
    return MAX_TARGET / BigInt(params.baseDifficulty);
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseDifficulty` | number | Static difficulty value |

**Use Case:** Short-lived mints, predictable tokenomics, testing

#### 2.2 Epoch-Based (Mode 1) - Bitcoin-Style

```typescript
function calculateTarget(params: EpochDAA, state: ContractState): bigint {
    const currentEpoch = Math.floor(state.height / params.epochLength);
    
    if (state.height % params.epochLength !== 0) {
        return state.currentTarget; // No adjustment mid-epoch
    }
    
    const actualTime = state.lastMintTime - state.epochStartTime;
    const expectedTime = params.epochLength * params.targetMintTime;
    
    let adjustment = expectedTime / actualTime;
    
    // Clamp adjustment
    adjustment = Math.max(1 / params.maxAdjustment, adjustment);
    adjustment = Math.min(params.maxAdjustment, adjustment);
    
    const newTarget = state.currentTarget * BigInt(Math.round(adjustment * 1000)) / 1000n;
    
    return clampTarget(newTarget, params.minDifficulty, params.maxDifficulty);
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `baseDifficulty` | number | required | Starting difficulty |
| `epochLength` | number | 100 | Mints per adjustment |
| `targetMintTime` | number | 60 | Target seconds per mint |
| `maxAdjustment` | number | 4 | Max multiplier per epoch |
| `minDifficulty` | number | 1 | Floor |
| `maxDifficulty` | number | optional | Ceiling |

**Use Case:** Long-running tokens, variable hashrate expected

#### 2.3 ASERT (Mode 2) - Exponential Moving Average

```typescript
function calculateTarget(params: AsertDAA, state: ContractState): bigint {
    // ASERT formula: target = anchor_target * 2^((time_delta - ideal_time) / halflife)
    
    const timeDelta = state.lastMintTime - params.anchorTime;
    const idealTime = state.height * params.targetMintTime;
    const exponent = (timeDelta - idealTime) / params.halflife;
    
    // Use fixed-point arithmetic for precision
    const multiplier = Math.pow(2, exponent);
    const newTarget = BigInt(Math.round(Number(params.anchorTarget) * multiplier));
    
    return clampTarget(newTarget, params.minDifficulty, params.maxDifficulty);
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `baseDifficulty` | number | required | Anchor difficulty |
| `anchorTime` | number | deploy time | Reference timestamp |
| `targetMintTime` | number | 60 | Target seconds per mint |
| `halflife` | number | 3600 | Seconds for 2x adjustment |
| `minDifficulty` | number | 1 | Floor |
| `maxDifficulty` | number | optional | Ceiling |

**Use Case:** Smooth difficulty curve, mathematically elegant, no oscillation

#### 2.4 LWMA (Mode 3) - Linearly Weighted Moving Average

```typescript
function calculateTarget(params: LwmaDAA, state: ContractState): bigint {
    const window = state.recentMints.slice(-params.windowSize);
    
    if (window.length < params.windowSize) {
        return state.currentTarget; // Not enough data yet
    }
    
    let weightedSum = 0n;
    let weightTotal = 0;
    
    for (let i = 0; i < window.length; i++) {
        const weight = i + 1; // Linear weight: recent = higher
        weightedSum += BigInt(window[i].solveTime) * BigInt(weight);
        weightTotal += weight;
    }
    
    const avgSolveTime = Number(weightedSum) / weightTotal;
    const adjustment = params.targetMintTime / avgSolveTime;
    
    const newTarget = state.currentTarget * BigInt(Math.round(adjustment * 1000)) / 1000n;
    
    return clampTarget(newTarget, params.minDifficulty, params.maxDifficulty);
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `baseDifficulty` | number | required | Starting difficulty |
| `windowSize` | number | 60 | Mints to consider |
| `targetMintTime` | number | 60 | Target seconds per mint |
| `minDifficulty` | number | 1 | Floor |
| `maxDifficulty` | number | optional | Ceiling |

**Use Case:** Responsive to hashrate changes, good for volatile mining interest

#### 2.5 Creator Schedule (Mode 4) - Predetermined Curve

```typescript
function calculateTarget(params: ScheduleDAA, state: ContractState): bigint {
    let difficulty: number;
    
    switch (params.scheduleType) {
        case 'linear':
            // difficulty = base + (height * slope)
            difficulty = params.baseDifficulty + (state.height * params.slope);
            break;
            
        case 'exponential':
            // difficulty = base * 2^(height / interval)
            const doublings = state.height / params.halvingInterval;
            difficulty = params.baseDifficulty * Math.pow(2, doublings);
            break;
            
        case 'stepped':
            // Lookup from predefined steps
            difficulty = params.baseDifficulty;
            for (const step of params.steps) {
                if (state.height >= step.height) {
                    difficulty = step.difficulty;
                }
            }
            break;
    }
    
    return MAX_TARGET / BigInt(Math.round(difficulty));
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseDifficulty` | number | Starting difficulty |
| `scheduleType` | string | 'linear' \| 'exponential' \| 'stepped' |
| `slope` | number | For linear: difficulty increase per mint |
| `halvingInterval` | number | For exponential: mints between 2x |
| `steps` | array | For stepped: [{height, difficulty}, ...] |

**Use Case:** Predictable tokenomics, "halving" style events, gamification

---

### 3. Contract Encoding

#### 3.1 Extended dMint Script Structure

The contract script encodes all parameters in a compact binary format:

```
<height:4> d8 <contractRef:36> d0 <tokenRef:36>
<maxHeight:var> <reward:var> <target:var>
<algoId:1> <daaMode:1> <daaParams:var>
<existing_contract_bytecode>
```

#### 3.2 Parameter Encoding

**Algorithm ID (1 byte):**
```
0x00 = SHA256d (default, backward compatible)
0x01 = Blake3
0x02 = KangarooTwelve
0x03 = Argon2id-Light
0x04 = RandomX-Light (reserved)
```

**DAA Mode (1 byte):**
```
0x00 = Fixed
0x01 = Epoch
0x02 = ASERT
0x03 = LWMA
0x04 = Schedule
```

**DAA Parameters (variable, mode-dependent):**

| Mode | Encoding |
|------|----------|
| Fixed | (none - uses baseDifficulty only) |
| Epoch | `<epochLength:2><targetTime:2><maxAdj:1><minDiff:var><maxDiff:var>` |
| ASERT | `<targetTime:2><halflife:4><minDiff:var><maxDiff:var>` |
| LWMA | `<windowSize:2><targetTime:2><minDiff:var><maxDiff:var>` |
| Schedule | `<type:1><params:var>` |

#### 3.3 Contract State (On-Chain)

For dynamic DAA modes, the contract must track state:

```
Output Script Data:
- height (current mint count)
- lastMintTime (timestamp of last successful mint)
- currentTarget (calculated target)
- epochStartTime (for Epoch mode)
- recentSolveTimes (for LWMA, encoded as deltas)
```

**Size Impact:**
- Fixed mode: +2 bytes (algoId + daaMode)
- Dynamic modes: +10-50 bytes depending on mode
- LWMA with 60-window: +~120 bytes for solve time history

This is well within Radiant's transaction limits and adds minimal cost (~0.001 RXD per byte).

---

### 4. TypeScript Interfaces

#### 4.1 Glyph Miner Types

```typescript
// src/types.ts additions

export type AlgorithmId = 'sha256d' | 'blake3' | 'k12' | 'argon2light';

export type DAAMode = 'fixed' | 'epoch' | 'asert' | 'lwma' | 'schedule';

export type ScheduleType = 'linear' | 'exponential' | 'stepped';

export interface AlgorithmParams {
    id: AlgorithmId;
    // Argon2-specific
    memoryKB?: number;      // 65536 - 262144 (64-256MB)
    iterations?: number;     // 1-3
}

export interface DAAParams {
    mode: DAAMode;
    baseDifficulty: number;
    
    // Bounds (all modes)
    minDifficulty?: number;
    maxDifficulty?: number;
    
    // Epoch mode
    epochLength?: number;
    targetMintTime?: number;
    maxAdjustment?: number;
    
    // ASERT mode
    halflife?: number;
    anchorTime?: number;
    
    // LWMA mode
    windowSize?: number;
    
    // Schedule mode
    scheduleType?: ScheduleType;
    slope?: number;
    halvingInterval?: number;
    steps?: Array<{ height: number; difficulty: number }>;
}

export interface ContractState {
    height: bigint;
    lastMintTime: number;
    currentTarget: bigint;
    epochStartTime?: number;
    recentSolveTimes?: number[];
}

export interface EnhancedContract extends Contract {
    algorithm: AlgorithmParams;
    daa: DAAParams;
    state: ContractState;
}
```

#### 4.2 Photonic Wallet Types

```typescript
// packages/lib/src/types.ts additions

export interface RevealDmintParams {
    address: string;
    numContracts: number;
    maxHeight: number;
    reward: number;
    premine: number;
    
    // NEW
    algorithm: AlgorithmId;
    algorithmParams?: {
        memoryKB?: number;
        iterations?: number;
    };
    
    daaMode: DAAMode;
    baseDifficulty: number;
    daaParams?: {
        epochLength?: number;
        targetMintTime?: number;
        maxAdjustment?: number;
        halflife?: number;
        windowSize?: number;
        scheduleType?: ScheduleType;
        slope?: number;
        halvingInterval?: number;
        steps?: Array<{ height: number; difficulty: number }>;
        minDifficulty?: number;
        maxDifficulty?: number;
    };
}
```

---

### 5. WebGPU Shader Architecture

#### 5.1 Shader Module Structure

```
src/
├── shaders/
│   ├── common.wgsl          # Shared utilities
│   ├── sha256d.wgsl         # Existing (refactored)
│   ├── blake3.wgsl          # New
│   ├── k12.wgsl             # Phase 3
│   └── argon2light.wgsl     # Phase 3
├── miner.ts                 # Shader loader/dispatcher
└── algorithms/
    ├── index.ts             # Algorithm registry
    ├── sha256d.ts           # SHA256d-specific logic
    ├── blake3.ts            # Blake3-specific logic
    ├── k12.ts               # K12-specific logic
    └── argon2light.ts       # Argon2-specific logic
```

#### 5.2 Algorithm Interface

```typescript
// src/algorithms/index.ts

export interface MiningAlgorithm {
    id: AlgorithmId;
    name: string;
    
    // Shader code
    getShaderCode(): string;
    
    // Work preparation
    prepareWork(work: Work): PreparedWork;
    
    // Verification (JS fallback)
    verify(target: bigint, preimage: Uint8Array, nonce: string): boolean;
    
    // GPU buffer requirements
    getBufferRequirements(): BufferRequirements;
}

export interface BufferRequirements {
    midstateSize: number;
    nonceSize: number;
    resultSize: number;
    workgroupSize: number;
    additionalBuffers?: Array<{
        name: string;
        size: number;
        usage: GPUBufferUsageFlags;
    }>;
}
```

---

## User Interface Changes

### Photonic Wallet - Content Upload

The wallet supports multiple content upload modes with a **512KB** maximum size:

```
┌─────────────────────────────────────────────────────────┐
│  What data do you want to store?                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ○ File           - Single file upload (max 512 KB)     │
│  ● Preview+Content- Image + file (combined max 512 KB)  │
│  ○ URL            - External link reference              │
│  ○ Text           - Plain text content                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Dual Upload Mode (Preview + Content):**

```
┌─────────────────────────────────────────────────────────┐
│  Preview Image + Content File                            │
│  Upload a preview image (like book cover) and content   │
│  file (max 512 KB total)                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Preview Image:                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [book_cover.jpg]                                 │  │
│  │  image/jpeg                                       │  │
│  │  45.2 KB                              [Delete]    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Content File:                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [manuscript.txt]                                 │  │
│  │  text/plain                                       │  │
│  │  312.8 KB                             [Delete]    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ℹ️ Combined size: 358 KB / 512 KB                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Content Modes:**

| Mode | Description | Size Limit | Use Case |
|------|-------------|------------|----------|
| File | Single file upload | 512 KB | Images, documents, any content |
| Preview + Content | Image + any file | 512 KB combined | Books, albums, rich media |
| URL | External reference | 512 KB | Links to external content |
| Text | Plain text | 512 KB | Articles, descriptions |

### Photonic Wallet - Token Creation

New form fields for FT dmint deployment:

```
┌─────────────────────────────────────────────────────────┐
│  Mining Configuration                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Algorithm:  [▼ Blake3                              ]   │
│              ○ SHA256d (Classic)                        │
│              ● Blake3 (Recommended)                     │
│              ○ KangarooTwelve                           │
│              ○ Argon2id-Light (Memory-Hard)             │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  Difficulty Mode:  [▼ ASERT (Smooth Adjustment)     ]   │
│              ○ Fixed (Never Changes)                    │
│              ○ Epoch (Bitcoin-Style)                    │
│              ● ASERT (Smooth Adjustment)                │
│              ○ LWMA (Responsive)                        │
│              ○ Schedule (Predetermined)                 │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  Base Difficulty:    [    10    ]                       │
│  Target Mint Time:   [    60    ] seconds               │
│  Halflife:           [  3600    ] seconds               │
│                                                          │
│  Min Difficulty:     [     1    ] (optional)            │
│  Max Difficulty:     [          ] (optional)            │
│                                                          │
│  ℹ️ Estimated time to mine: ~45 seconds on RTX 4090     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Glyph Miner - Contract Display

Show algorithm and DAA info when loading a contract:

```
┌─────────────────────────────────────────────────────────┐
│  TOKEN_NAME                                              │
│  ref: abc123...                                          │
├─────────────────────────────────────────────────────────┤
│  Algorithm:     Blake3                                   │
│  Difficulty:    ASERT (Dynamic)                          │
│  Current Diff:  15.2 (base: 10)                         │
│  Target Time:   60s                                      │
│  Avg Time:      52s (last 10 mints)                     │
│  Minted:        1,234 / 10,000                          │
│  Reward:        100 tokens                               │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Blake3 + Infrastructure (Weeks 1-3)

**Goal:** Add Blake3 algorithm with existing Fixed DAA

#### Tasks:

- [ ] **1.1** Create `src/shaders/blake3.wgsl` - Blake3 WebGPU implementation
- [ ] **1.2** Create `src/algorithms/` module structure
- [ ] **1.3** Refactor `src/pow.wgsl` → `src/shaders/sha256d.wgsl`
- [ ] **1.4** Create algorithm registry and loader in `src/miner.ts`
- [ ] **1.5** Update `src/types.ts` with algorithm types
- [ ] **1.6** Add algorithm parsing from contract script
- [ ] **1.7** Update Photonic Wallet `packages/lib/src/script.ts` with algorithm encoding
- [ ] **1.8** Add algorithm selector to Photonic Wallet mint UI
- [ ] **1.9** Write Blake3 verification tests
- [ ] **1.10** Integration testing with test contracts

**Deliverable:** Miner supports both SHA256d and Blake3 contracts

---

### Phase 2: Dynamic DAA Implementation (Weeks 4-5)

**Goal:** Implement all 5 DAA modes

#### Tasks:

- [ ] **2.1** Create `src/daa/` module with DAA calculators
- [ ] **2.2** Implement Fixed DAA (refactor existing)
- [ ] **2.3** Implement Epoch DAA
- [ ] **2.4** Implement ASERT DAA
- [ ] **2.5** Implement LWMA DAA
- [ ] **2.6** Implement Schedule DAA
- [ ] **2.7** Update contract script encoding for DAA params
- [ ] **2.8** Update contract state parsing
- [ ] **2.9** Add DAA mode selector to Photonic Wallet
- [ ] **2.10** Add DAA parameter inputs (conditional on mode)
- [ ] **2.11** Display current difficulty in miner UI
- [ ] **2.12** Write DAA unit tests
- [ ] **2.13** Integration testing with each DAA mode

**Deliverable:** Full DAA support for all modes

---

### Phase 3: Additional Algorithms (Weeks 6-8)

**Goal:** Add K12 and Argon2id-Light

#### Tasks:

- [ ] **3.1** Create `src/shaders/k12.wgsl` - KangarooTwelve implementation
- [ ] **3.2** Create `src/algorithms/k12.ts`
- [ ] **3.3** Create `src/shaders/argon2light.wgsl` - Argon2id implementation
- [ ] **3.4** Create `src/algorithms/argon2light.ts`
- [ ] **3.5** Handle Argon2 memory buffer allocation
- [ ] **3.6** Add memory parameter UI for Argon2
- [ ] **3.7** Update algorithm selector with new options
- [ ] **3.8** Performance benchmarking across GPUs
- [ ] **3.9** Write verification tests for K12 and Argon2
- [ ] **3.10** Integration testing

**Deliverable:** 4 algorithm choices (SHA256d, Blake3, K12, Argon2)

---

### Phase 4: Polish & Documentation (Weeks 9-10)

**Goal:** Production-ready release

#### Tasks:

- [ ] **4.1** Error handling improvements
- [ ] **4.2** Loading states and progress indicators
- [ ] **4.3** Hashrate estimation per algorithm
- [ ] **4.4** Time-to-mine estimates in UI
- [ ] **4.5** Help tooltips for DAA modes
- [ ] **4.6** Update README documentation
- [ ] **4.7** Create user guide for token creators
- [ ] **4.8** Performance optimization pass
- [ ] **4.9** Browser compatibility testing
- [ ] **4.10** Security review of contract encoding

**Deliverable:** Production release v2.0

---

### Future: CLI Miner & CPU Algorithm (Deferred)

**Goal:** Multi-GPU support and CPU mining option

#### Tasks:

- [ ] **F.1** Evaluate Electron vs Tauri vs Pure Node
- [ ] **F.2** Create CLI miner project structure
- [ ] **F.3** Port WebGPU shaders to CLI (vulkan/metal backend)
- [ ] **F.4** Implement GPU enumeration and multi-device mining
- [ ] **F.5** Implement RandomX-Light for CPU
- [ ] **F.6** Add pool mining protocol support
- [ ] **F.7** Create installer packages (Windows, macOS, Linux)

**Note:** This phase is deferred until WebGPU implementation is stable. Recommend Electron + Node for accessibility (cross-platform, JS ecosystem familiarity).

---

## Testing Strategy

### Unit Tests

- Algorithm correctness (hash verification)
- DAA calculations (known inputs → expected outputs)
- Contract encoding/decoding
- Target calculations

### Integration Tests

- Full mining cycle with test contracts
- Contract creation in Photonic Wallet
- Mining and submission in Glyph Miner
- State updates after successful mints

### Performance Tests

- Hashrate benchmarks per algorithm
- Memory usage for Argon2
- GPU memory allocation
- Browser performance impact

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Blake3 WGSL bugs | Medium | High | Extensive testing, reference implementation comparison |
| Contract encoding errors | Medium | Critical | Strict validation, backward compat tests |
| WebGPU memory limits (Argon2) | Medium | Medium | Configurable memory, graceful degradation |
| Browser compatibility | Low | Medium | Feature detection, fallback messaging |
| DAA edge cases | Medium | Medium | Extensive unit tests, bounds checking |

---

## Success Metrics

1. **Adoption:** >50% of new dmint contracts use new algorithms within 3 months
2. **Fairness:** Hashrate distribution shows more diverse mining (not dominated by top 5 miners)
3. **Stability:** No critical bugs in production for 30 days post-launch
4. **Performance:** Blake3 achieves >2x hashrate vs SHA256d on same hardware
5. **UX:** Token creators successfully deploy contracts with dynamic DAA

---

## Appendix A: Blake3 Reference

Blake3 is a cryptographic hash function that:
- Uses a Merkle tree structure internally
- Supports unlimited output length
- Is based on the BLAKE2 and Bao designs
- Achieves ~3x SHA256 performance

Reference implementation: https://github.com/BLAKE3-team/BLAKE3

## Appendix B: ASERT Technical Details

ASERT (Absolute Scheduled Exponentially Rising Targets) was developed for Bitcoin Cash:
- Paper: https://read.cash/@jtoomim/bch-upgrade-proposal-use-asert-as-the-new-daa-1d875696
- Provides smooth difficulty adjustments
- No oscillation even with variable hashrate
- Mathematically provable stability

## Appendix C: Contract Size Calculations

| Mode | Additional Bytes | Est. Cost (RXD) |
|------|-----------------|-----------------|
| Fixed | 2 | 0.000002 |
| Epoch | 12 | 0.000012 |
| ASERT | 14 | 0.000014 |
| LWMA | 12 | 0.000012 |
| Schedule (10 steps) | 52 | 0.000052 |

All sizes are negligible relative to typical transaction costs.
