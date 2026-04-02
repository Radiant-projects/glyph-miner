# DAA Configuration Guide

This guide covers Dynamic Difficulty Adjustment (DAA) modes and their configuration for optimal mining performance.

## Overview

Dynamic Difficulty Adjustment (DAA) automatically adjusts mining difficulty based on network conditions to maintain consistent block times. Glyph Miner supports 5 different DAA modes, each suited for different use cases.

## DAA Modes

### 1. Fixed Difficulty

**Description**: Static difficulty that never changes
**Best For**: Testing, development, stable networks
**Configuration**: Simple and predictable

#### Parameters
```typescript
interface FixedDAAParams {
  targetBlockTime: number;  // Target seconds between blocks
  difficulty: bigint;      // Static difficulty value
}
```

#### Example Configuration
```bash
# CLI
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode fixed -d 10000 --target-time 60

# Wallet UI
- DAA Mode: Fixed
- Difficulty: 10000
- Target Block Time: 60 seconds
```

#### Use Cases
- Token launches with predictable supply
- Testing environments
- Networks with stable hashrate

---

### 2. Epoch-Based Difficulty

**Description**: Difficulty changes at fixed intervals (epochs)
**Best For**: Gradual difficulty adjustment
**Configuration**: Epoch length and adjustment factor

#### Parameters
```typescript
interface EpochDAAParams {
  targetBlockTime: number;    // Target seconds between blocks
  epochLength: number;        // Blocks per epoch
  adjustmentFactor: number;   // Difficulty multiplier (0.5-2.0)
  maxAdjustment: number;      // Maximum change per epoch
}
```

#### Example Configuration
```bash
# CLI
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode epoch --target-time 60

# Contract Parameters
epochLength: 1008        // ~1 week at 10 min blocks
adjustmentFactor: 1.1     // 10% max adjustment
maxAdjustment: 0.5        // 50% max change per epoch
```

#### Use Cases
- Gradual network growth
- Predictable difficulty changes
- Long-term mining planning

---

### 3. ASERT (Absolutely Scheduled Exponentially Rising Target)

**Description**: Advanced DAA with exponential convergence
**Best For**: Rapid hashrate changes, responsive adjustment
**Configuration**: Half-life and convergence parameters

#### Parameters
```typescript
interface ASERTDAAParams {
  targetBlockTime: number;    // Target seconds between blocks
  halfLife: number;           // Difficulty half-life (blocks)
  maxChange: number;          // Maximum change per block
  minChange: number;          // Minimum change per block
}
```

#### Example Configuration
```bash
# CLI
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode asert --target-time 60

# Contract Parameters
halfLife: 144               // ~1 day at 10 min blocks
maxChange: 0.1             // 10% max change per block
minChange: 0.001           // 0.1% min change per block
```

#### Use Cases
- Volatile hashrate networks
- Rapid response to mining attacks
- Professional mining operations

---

### 4. LWMA (Linear Weighted Moving Average)

**Description**: Weighted average of recent block times
**Best For**: Smooth difficulty adjustment
**Configuration**: Window size and weight parameters

#### Parameters
```typescript
interface LWMADAAParams {
  targetBlockTime: number;    // Target seconds between blocks
  windowSize: number;         // Number of blocks to average
  weightFactor: number;       // Weight decay factor
  maxChange: number;          // Maximum change per block
}
```

#### Example Configuration
```bash
# CLI
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode lwma --target-time 60

# Contract Parameters
windowSize: 144             // ~1 day at 10 min blocks
weightFactor: 0.95          // Exponential decay
maxChange: 0.05             // 5% max change per block
```

#### Use Cases
- Stable mining environments
- Gradual hashrate changes
- Predictable difficulty patterns

---

### 5. Schedule-Based Difficulty

**Description**: Pre-defined difficulty schedule
**Best For**: Token launches with planned supply
**Configuration**: Time-based difficulty changes

#### Parameters
```typescript
interface ScheduleDAAParams {
  targetBlockTime: number;    // Target seconds between blocks
  schedule: Array<{           // Difficulty schedule
    blockHeight: number;      // Block height for change
    difficulty: bigint;       // New difficulty
  }>;
}
```

#### Example Configuration
```bash
# CLI
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode schedule --target-time 60

# Contract Parameters
schedule: [
  { blockHeight: 0, difficulty: 1000 },      // Easy start
  { blockHeight: 1000, difficulty: 5000 },   // Gradual increase
  { blockHeight: 5000, difficulty: 10000 },  // Medium difficulty
  { blockHeight: 10000, difficulty: 25000 }, // Higher difficulty
]
```

#### Use Cases
- Fair launches with gradual difficulty increase
- Pre-planned token distribution
- Anti-whale mining protection

## DAA Parameter Encoding

DAA parameters are encoded in the contract script for on-chain storage:

```typescript
// DAA parameter encoding/decoding
function encodeDAAParams(mode: DAAMode, params: any): Uint8Array {
  switch (mode) {
    case 'fixed':
      return encodeFixedParams(params);
    case 'epoch':
      return encodeEpochParams(params);
    case 'asert':
      return encodeASERTParams(params);
    case 'lwma':
      return encodeLWMAParams(params);
    case 'schedule':
      return encodeScheduleParams(params);
  }
}
```

## Configuration Examples

### Token Launch Configuration

```typescript
// Fair launch with gradual difficulty increase
const launchConfig = {
  algorithm: 'blake3',
  daaMode: 'schedule',
  daaParams: {
    targetBlockTime: 60,
    schedule: [
      { blockHeight: 0, difficulty: 1000 },      // Day 1: Easy mining
      { blockHeight: 1440, difficulty: 2500 },    // Day 2: Moderate
      { blockHeight: 2880, difficulty: 5000 },    // Day 3: Harder
      { blockHeight: 5760, difficulty: 10000 },   // Day 5: Stable
    ]
  }
};
```

### Professional Mining Configuration

```typescript
// High-performance mining with responsive DAA
const professionalConfig = {
  algorithm: 'blake3',
  daaMode: 'asert',
  daaParams: {
    targetBlockTime: 30,      // Fast blocks
    halfLife: 72,             // 12-hour half-life
    maxChange: 0.15,         // 15% max change
    minChange: 0.001,        // 0.1% min change
  }
};
```

### CPU Mining Configuration

```typescript
// CPU-friendly with stable difficulty
const cpuConfig = {
  algorithm: 'randomx-light',
  daaMode: 'lwma',
  daaParams: {
    targetBlockTime: 120,     // Slower blocks
    windowSize: 288,          // 2-day window
    weightFactor: 0.9,        // Smooth averaging
    maxChange: 0.03,          // 3% max change
  }
};
```

## CLI Configuration

### Basic DAA Setup

```bash
# Fixed difficulty (simple)
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode fixed -d 10000

# ASERT with custom parameters
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode asert --target-time 60

# LWMA for stable mining
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode lwma --target-time 120
```

### Advanced DAA Parameters

```bash
# Epoch-based with custom settings
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode epoch \
  --target-time 60 \
  --epoch-length 1008 \
  --adjustment-factor 1.1

# ASERT with fast response
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode asert \
  --target-time 30 \
  --half-life 36 \
  --max-change 0.2
```

## Wallet UI Configuration

### Photonic Wallet DAA Settings

1. **Select DAA Mode**: Choose from dropdown (Fixed, Epoch, ASERT, LWMA, Schedule)
2. **Set Target Block Time**: Enter desired block interval in seconds
3. **Configure Parameters**: Mode-specific fields appear based on selection

#### Fixed Mode
- Target Block Time: 60 seconds
- Difficulty: 10000

#### Epoch Mode
- Target Block Time: 60 seconds
- Epoch Length: 1008 blocks
- Adjustment Factor: 1.1
- Max Adjustment: 50%

#### ASERT Mode
- Target Block Time: 60 seconds
- Half Life: 144 blocks
- Max Change: 10%
- Min Change: 0.1%

#### LWMA Mode
- Target Block Time: 60 seconds
- Window Size: 144 blocks
- Weight Factor: 0.95
- Max Change: 5%

#### Schedule Mode
- Target Block Time: 60 seconds
- Schedule: Add block height/difficulty pairs

## Performance Considerations

### Algorithm vs DAA Compatibility

| Algorithm | Best DAA Mode | Reason |
|-----------|---------------|---------|
| Blake3 | ASERT | High hashrate needs responsive adjustment |
| Argon2id-Light | LWMA | Memory-hard benefits from stability |
| RandomX-Light | Epoch | CPU mining needs predictable changes |
| K12 | Fixed | Balanced performance with stable difficulty |
| SHA256d | Schedule | Legacy compatibility with planned changes |

### Target Block Time Recommendations

| Use Case | Recommended Time | Algorithm |
|----------|------------------|-----------|
| Fast transactions | 30-60 seconds | Blake3 |
| General mining | 60-120 seconds | K12, Argon2id-Light |
| CPU mining | 120-300 seconds | RandomX-Light |
| Testing | 10-30 seconds | Any algorithm |

### Difficulty Ranges

| Algorithm | Min Difficulty | Max Difficulty | Recommended |
|-----------|----------------|----------------|-------------|
| Blake3 | 1,000,000 | 100,000,000 | 2,500,000 |
| K12 | 25,000 | 5,000,000 | 50,000 |
| Argon2id-Light | 5,000 | 500,000 | 10,000 |
| RandomX-Light | 10,000 | 1,000,000 | 25,000 |
| SHA256d | 100,000 | 10,000,000 | 500,000 |

## Monitoring and Analytics

### DAA Performance Metrics

```typescript
interface DAAMetrics {
  currentDifficulty: bigint;
  averageBlockTime: number;
  hashrate: number;
  adjustmentHistory: Array<{
    timestamp: number;
    oldDifficulty: bigint;
    newDifficulty: bigint;
    reason: string;
  }>;
}
```

### Real-time Monitoring

```bash
# Enable verbose DAA logging
npm run cli -- -a blake3 -w rdx:xxxxxxxx --verbose --daa-mode asert

# Monitor DAA adjustments
tail -f mining.log | grep "DAA Adjustment"
```

## Troubleshooting

### Common DAA Issues

**Difficulty too high for hashrate:**
```bash
# Check current difficulty
npm run cli -- -a blake3 -w rdx:xxxxxxxx --benchmark

# Use fixed difficulty temporarily
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode fixed -d 5000
```

**Frequent difficulty changes:**
```bash
# Switch to LWMA for stability
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode lwma --target-time 120
```

**Slow difficulty response:**
```bash
# Use ASERT for faster response
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode asert --half-life 36
```

### DAA Parameter Validation

```typescript
function validateDAAParams(mode: DAAMode, params: any): ValidationResult {
  switch (mode) {
    case 'fixed':
      return params.difficulty > 0;
    case 'epoch':
      return params.epochLength > 0 && params.adjustmentFactor > 0;
    case 'asert':
      return params.halfLife > 0 && params.maxChange > 0;
    case 'lwma':
      return params.windowSize > 0 && params.weightFactor > 0;
    case 'schedule':
      return params.schedule?.length > 0;
  }
}
```

## Best Practices

### Token Launch
1. Start with low difficulty (1000-5000)
2. Use schedule-based DAA for predictable increases
3. Monitor hashrate growth closely
4. Adjust schedule if needed

### Professional Mining
1. Use ASERT for responsive adjustment
2. Set appropriate target block times
3. Monitor DAA performance metrics
4. Optimize for network conditions

### CPU Mining
1. Choose RandomX-Light or K12
2. Use LWMA for stable difficulty
3. Set longer target block times
4. Monitor CPU utilization

## References

- [ASERT Paper](https://eprint.iacr.org/2019/902)
- [LWMA Specification](https://github.com/zawy12/difficulty-algorithms)
- [Bitcoin DAA Analysis](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
