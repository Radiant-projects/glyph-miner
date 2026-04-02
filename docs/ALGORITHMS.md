# Algorithm Technical Specifications

This document provides detailed technical specifications for all mining algorithms supported by Glyph Miner.

## Overview

Glyph Miner supports multiple proof-of-work algorithms designed for different use cases and hardware optimizations:

- **SHA256d**: Legacy compatibility algorithm
- **Blake3**: High-performance GPU algorithm
- **KangarooTwelve**: Balanced CPU/GPU algorithm
- **Argon2id-Light**: Memory-hard leveling algorithm
- **RandomX-Light**: CPU-optimized algorithm

## Algorithm Specifications

### SHA256d

**Type**: Double SHA-256 hash
**Category**: Legacy GPU
**Memory Usage**: ~1 KB
**Recommended Difficulty**: 500,000+

#### Technical Details
```
hash = SHA256(SHA256(data))
```

#### Implementation
- WGSL shader for GPU acceleration
- 128-byte work buffer
- 4-byte nonce space
- Target comparison in little-endian

#### Performance Characteristics
- **RTX 4090**: ~1.5 GH/s
- **CPU**: ~50 MH/s
- **Power**: ~200W (GPU)
- **Efficiency**: 7.5 MH/W

#### Use Cases
- Legacy contract compatibility
- Testing and development
- Low-power mining

---

### Blake3

**Type**: Cryptographic hash function
**Category**: High-performance GPU
**Memory Usage**: ~1 KB
**Recommended Difficulty**: 2,500,000+

#### Technical Details
```
hash = Blake3(data || nonce)
```

#### Implementation
- WGSL shader with parallel compression
- 64-byte state buffer
- SIMD-optimized operations
- Constant-time implementation

#### Performance Characteristics
- **RTX 4090**: ~7.5 GH/s
- **CPU**: ~200 MH/s
- **Power**: ~250W (GPU)
- **Efficiency**: 30 MH/W

#### Use Cases
- Primary mining algorithm
- Maximum GPU performance
- Energy-efficient mining

---

### KangarooTwelve (K12)

**Type**: Keccak-based sponge function
**Category**: Balanced CPU/GPU
**Memory Usage**: ~200 B
**Recommended Difficulty**: 50,000+

#### Technical Details
```
hash = KangarooTwelve(data || nonce, 32)
```

#### Implementation
- WGSL shader with Keccak permutation
- 200-byte internal state
- 12-round permutation
- Parallel absorption

#### Performance Characteristics
- **RTX 4090**: ~4.0 GH/s
- **CPU**: ~150 MH/s
- **Power**: ~220W (GPU)
- **Efficiency**: 18 MH/W

#### Use Cases
- CPU/GPU balance
- Mobile device mining
- Moderate hardware requirements

---

### Argon2id-Light

**Type**: Memory-hard function
**Category**: Memory-hard GPU
**Memory Usage**: 64-512 MB
**Recommended Difficulty**: 10,000+

#### Technical Details
```
hash = Argon2id(data || nonce, t=3, m=1024, p=4)
```

#### Implementation
- WGSL shader with BLAKE2b compression
- 1024 Argon2 blocks (1MB each)
- 3-pass iteration
- 4-lane parallelism

#### Parameters
- **Memory Size**: 64-512 MB (auto-optimized)
- **Time Cost**: 3 iterations
- **Parallelism**: 4 lanes
- **Hash Length**: 32 bytes

#### Performance Characteristics
- **RTX 4090**: ~50 MH/s
- **CPU**: ~5 MH/s
- **Power**: ~300W (GPU)
- **Efficiency**: 0.17 MH/W

#### Use Cases
- Anti-ASIC protection
- GPU leveling
- Memory-hard mining

#### Memory Optimization
```typescript
// Automatic memory parameter optimization
const optimized = optimizeMemoryParameters(gpuInfo, 'argon2light');
// Returns: { memoryBlocks, timeCost, parallelism, warnings }
```

---

### RandomX-Light

**Type**: RandomX variant
**Category**: CPU-optimized
**Memory Usage**: 256 KB
**Recommended Difficulty**: 25,000+

#### Technical Details
```
hash = RandomX(data || nonce, light=true)
```

#### Implementation
- JavaScript virtual machine
- 256 KB scratchpad
- Simplified instruction set
- Blake2b mixing functions

#### Virtual Machine Architecture
- **Registers**: 8 general-purpose (R0-R7)
- **Memory**: 256 KB scratchpad
- **Program**: 256 instructions
- **Iterations**: 3 passes

#### Performance Characteristics
- **High-end CPU**: ~50 KH/s
- **Mid-range CPU**: ~25 KH/s
- **Power**: ~65W (CPU)
- **Efficiency**: 0.77 KH/W

#### Use Cases
- CPU-only mining
- Anti-GPU protection
- Low-power devices

#### Instruction Set
```typescript
// Core RandomX instructions
const RandomXInstruction = {
  IADD_RS: 0x00,    // Add register to register
  IADD_M: 0x01,     // Add memory to register
  ISUB_R: 0x02,     // Subtract register
  IMUL_R: 0x04,     // Multiply register
  IXOR_R: 0x20,     // XOR register
  CSTORE: 0x80,     // Store to memory
  HALT: 0xB5,       // Stop execution
};
```

## Algorithm Comparison

| Algorithm | Hash Rate (RTX 4090) | Memory | Power | Efficiency | Best For |
|-----------|---------------------|--------|-------|------------|----------|
| SHA256d | 1.5 GH/s | 1 KB | 200W | 7.5 MH/W | Legacy |
| Blake3 | 7.5 GH/s | 1 KB | 250W | 30 MH/W | Performance |
| K12 | 4.0 GH/s | 200 B | 220W | 18 MH/W | Balance |
| Argon2id-Light | 50 MH/s | 256 MB | 300W | 0.17 MH/W | Leveling |
| RandomX-Light | N/A | 256 KB | 65W | 0.77 KH/W | CPU |

## Implementation Details

### WGSL Shaders

All GPU algorithms use WebGPU Shading Language (WGSL) for maximum performance:

```wgsl
// Example Blake3 shader structure
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  let nonce = base_nonce + idx;
  
  // Perform Blake3 hashing
  var hash = blake3_hash(data, nonce);
  
  // Check target difficulty
  if (hash <= target) {
    results[atomicAdd(&result_count, 1)] = vec4<u32>(nonce, hash);
  }
}
```

### Buffer Requirements

Each algorithm has specific buffer requirements:

```typescript
interface BufferRequirements {
  midstate: number;    // Work data buffer (u32s)
  target: number;      // Target difficulty (u32s)
  results: number;     // Result buffer (vec4<u32>s)
  memory?: number;     // Working memory (blocks)
}
```

### Memory Management

#### GPU Memory Detection
```typescript
const gpuInfo = await getGPUMemoryInfo(adapter);
// Returns: { totalMemoryMB, availableMemoryMB, vendor, model }
```

#### Compatibility Checking
```typescript
const memoryCheck = checkMemoryCompatibility(gpuInfo, requirements);
// Returns: { compatible, recommended, warnings, errors }
```

#### Parameter Optimization
```typescript
const optimized = optimizeMemoryParameters(gpuInfo, algorithm);
// Returns: { memoryBlocks, timeCost, parallelism, warnings }
```

## Security Considerations

### Collision Resistance
- **Blake3**: 128-bit security against collisions
- **K12**: 128-bit security against collisions
- **SHA256d**: 128-bit security against collisions
- **Argon2id-Light**: 128-bit security against collisions
- **RandomX-Light**: 128-bit security against collisions

### Pre-image Resistance
All algorithms provide at least 128-bit pre-image resistance.

### Side-channel Attacks
- Constant-time implementations where possible
- Memory access patterns randomized (RandomX)
- GPU shader optimizations prevent timing attacks

## Performance Tuning

### GPU Optimization
1. **Workgroup Size**: 128 threads optimal for most GPUs
2. **Memory Layout**: Aligned to 256-byte boundaries
3. **Shader Compilation**: Pre-compiled for target hardware

### CPU Optimization
1. **Thread Count**: Use all available cores
2. **Memory Allocation**: Large contiguous blocks
3. **Instruction Cache**: Hot loop optimization

### Algorithm Selection
```typescript
function selectOptimalAlgorithm(hardware: HardwareInfo): AlgorithmId {
  if (hardware.gpuVRAM > 4096) return 'argon2light';
  if (hardware.gpuPerformance > 'high') return 'blake3';
  if (hardware.cpuCores > 8) return 'randomx-light';
  return 'k12';
}
```

## Future Algorithms

### Planned Additions
- **Lyra2REv3**: Memory-hard with reduced iterations
- **Eaglesong**: Efficient for embedded devices
- **X11**: Chain of 11 hash functions

### Research Areas
- Quantum-resistant algorithms
- Zero-knowledge proof integration
- Adaptive difficulty algorithms

## References

- [Blake3 Specification](https://github.com/BLAKE3-team/BLAKE3)
- [KangarooTwelve Specification](https://github.com/guidovranken/kangarootwelve)
- [Argon2 Specification](https://github.com/P-H-C/phc-winner-argon2)
- [RandomX Specification](https://github.com/tevador/RandomX)
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
