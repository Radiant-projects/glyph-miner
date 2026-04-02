import { describe, it, expect } from 'vitest';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';

describe('Endianness Verification', () => {
  it('should show how CPU reads hash bytes vs GPU u32 array', () => {
    // Create a test hash with known bytes
    const hash = new Uint8Array([
      0x00, 0x00, 0x00, 0x00,  // bytes 0-3 (must be zero)
      0x00, 0x00, 0x01, 0x23,  // bytes 4-7
      0x45, 0x67, 0x89, 0xAB,  // bytes 8-11
      0xCD, 0xEF, 0x12, 0x34,  // bytes 12-15
      0x56, 0x78, 0x9A, 0xBC,  // bytes 16-19
      0xDE, 0xF0, 0x11, 0x22,  // bytes 20-23
      0x33, 0x44, 0x55, 0x66,  // bytes 24-27
      0x77, 0x88, 0x99, 0xAA   // bytes 28-31
    ]);

    // CPU check: first 4 bytes must be 0
    const cpuCheck1 = hash[0] === 0 && hash[1] === 0 && hash[2] === 0 && hash[3] === 0;
    console.log('CPU check 1 (first 4 bytes = 0):', cpuCheck1);

    // CPU check: bytes 4-11 as big-endian u64
    const view = new DataView(hash.buffer);
    const cpuBytes4to11 = view.getBigUint64(4, false); // big-endian
    console.log('CPU bytes 4-11 as BE u64:', cpuBytes4to11.toString(16));

    // GPU reading as little-endian u32 array
    const gpuHash = new Uint32Array(8);
    for (let i = 0; i < 8; i++) {
      gpuHash[i] = view.getUint32(i * 4, true); // little-endian
    }
    console.log('GPU hash[0] (bytes 0-3 as LE u32):', gpuHash[0].toString(16));
    console.log('GPU hash[1] (bytes 4-7 as LE u32):', gpuHash[1].toString(16));
    console.log('GPU hash[2] (bytes 8-11 as LE u32):', gpuHash[2].toString(16));

    // For GPU to match CPU bytes 4-11 check:
    // CPU compares as big-endian: 0x0000012345678 9AB
    // GPU needs to compare hash[1], hash[2] but in big-endian order
    
    // Byte-swap to convert LE u32 to BE for comparison
    const bswap = (x: number) => {
      return (((x & 0xFF) << 24) |
              ((x & 0xFF00) << 8) |
              ((x >>> 8) & 0xFF00) |
              (x >>> 24)) >>> 0;
    };
    
    const gpuHash1BE = bswap(gpuHash[1]) >>> 0;
    const gpuHash2BE = bswap(gpuHash[2]) >>> 0;
    console.log('GPU hash[1] byte-swapped:', gpuHash1BE.toString(16));
    console.log('GPU hash[2] byte-swapped:', gpuHash2BE.toString(16));

    // Reconstruct big-endian u64 from byte-swapped u32s
    const reconstructed = (BigInt(gpuHash1BE) << 32n) | BigInt(gpuHash2BE);
    console.log('Reconstructed BE u64:', reconstructed.toString(16));
    
    expect(reconstructed).toBe(cpuBytes4to11);
  });

  it('should find real blake3 hash with leading zeros and show format', () => {
    const preimage = new Uint8Array(64);
    for (let i = 0; i < 64; i++) preimage[i] = i;

    // Find a nonce that gives leading zeros
    for (let nonce = 0; nonce < 1000000; nonce++) {
      const input = new Uint8Array(72);
      input.set(preimage);
      const nonceView = new DataView(input.buffer);
      nonceView.setUint32(64, nonce, true);
      
      const hash = blake3(input);
      
      // Check if first 4 bytes are zero
      if (hash[0] === 0 && hash[1] === 0 && hash[2] === 0 && hash[3] === 0) {
        console.log(`\nFound nonce ${nonce} with 4 leading zero bytes`);
        console.log('Hash:', bytesToHex(hash));
        
        // Show as u32 array (little-endian)
        const view = new DataView(hash.buffer);
        console.log('As LE u32 array:');
        for (let i = 0; i < 8; i++) {
          console.log(`  hash[${i}] = 0x${view.getUint32(i * 4, true).toString(16).padStart(8, '0')}`);
        }
        
        // Show CPU target check
        const cpuNext8 = view.getBigUint64(4, false);
        console.log(`CPU bytes 4-11 as BE u64: 0x${cpuNext8.toString(16)}`);
        
        break;
      }
    }
  });
});
