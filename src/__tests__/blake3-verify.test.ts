import { describe, it, expect } from 'vitest';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';

// Test exact Blake3 computation to verify GPU shader matches CPU
describe('Blake3 Exact Verification', () => {
  // Create a 72-byte input (64 byte preimage + 8 byte nonce)
  const createInput = (nonce: number): Uint8Array => {
    const input = new Uint8Array(72);
    // Fill preimage with predictable data
    for (let i = 0; i < 64; i++) {
      input[i] = i;
    }
    // Add nonce as little-endian 64-bit integer
    const view = new DataView(input.buffer);
    view.setUint32(64, nonce, true); // low 32 bits
    view.setUint32(68, 0, true);     // high 32 bits
    return input;
  };

  it('should hash 72 bytes correctly', () => {
    const input = createInput(0);
    const hash = blake3(input);
    console.log('Blake3 hash of 72 zeros-based input:', bytesToHex(hash));
    console.log('First 4 bytes:', hash[0], hash[1], hash[2], hash[3]);
    expect(hash.length).toBe(32);
  });

  it('should find a nonce with leading zeros', () => {
    // Try to find a nonce that produces hash with first byte = 0
    let found = false;
    for (let nonce = 0; nonce < 1000000; nonce++) {
      const input = createInput(nonce);
      const hash = blake3(input);
      if (hash[0] === 0) {
        console.log(`Found nonce ${nonce} with hash starting with 0x00`);
        console.log('Hash:', bytesToHex(hash));
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('should verify nonce byte order in preimage', () => {
    // Test nonce=1 placement
    const input = createInput(1);
    console.log('Input bytes 64-71 for nonce=1:', 
      Array.from(input.slice(64, 72)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    // Nonce 1 in little-endian should be: 01 00 00 00 00 00 00 00
    expect(input[64]).toBe(1);
    expect(input[65]).toBe(0);
    expect(input[66]).toBe(0);
    expect(input[67]).toBe(0);
  });

  it('should match GPU shader data format', () => {
    // Simulate what GPU receives: midstate (64 bytes as 16 u32s little-endian)
    const preimage = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      preimage[i] = i;
    }
    
    // Convert to u32 array (little-endian) like GPU does
    const midstateU32 = new Uint32Array(16);
    const preimageView = new DataView(preimage.buffer);
    for (let i = 0; i < 16; i++) {
      midstateU32[i] = preimageView.getUint32(i * 4, true);
    }
    
    console.log('Midstate u32[0]:', midstateU32[0].toString(16));
    console.log('Midstate u32[1]:', midstateU32[1].toString(16));
    
    // midstate[0] should be bytes 0-3 as little-endian u32
    // bytes: 0x00, 0x01, 0x02, 0x03 -> u32: 0x03020100
    expect(midstateU32[0]).toBe(0x03020100);
  });

  it('should verify target format for GPU', () => {
    // Target is 64-bit value like 0x00000fffffffffff
    const target = 0x00000fffffffffffn;
    
    // GPU expects: [0, high32, low32, 0xFFFFFFFF, ...]
    const targetU32 = new Uint32Array(8);
    targetU32[0] = 0; // First 32 bits of hash must be zero
    targetU32[1] = Number((target >> 32n) & 0xffffffffn);
    targetU32[2] = Number(target & 0xffffffffn);
    for (let i = 3; i < 8; i++) targetU32[i] = 0xFFFFFFFF;
    
    console.log('Target u32 array:', Array.from(targetU32).map(n => n.toString(16)));
    
    // For target 0x00000fffffffffff:
    // high32 = 0x00000fff
    // low32 = 0xffffffff
    expect(targetU32[1]).toBe(0x00000fff);
    expect(targetU32[2]).toBe(0xffffffff);
  });

  it('should verify hash comparison logic', () => {
    // Simulate GPU hash check
    const hash = new Uint32Array([0, 0x00000100, 0, 0, 0, 0, 0, 0]);
    const target = new Uint32Array([0, 0x00000fff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]);
    
    // GPU comparison: hash[i] < target[i] = valid
    let isValid = false;
    for (let i = 0; i < 8; i++) {
      if (hash[i] < target[i]) {
        isValid = true;
        break;
      }
      if (hash[i] > target[i]) {
        isValid = false;
        break;
      }
    }
    
    console.log('Hash vs target comparison result:', isValid);
    expect(isValid).toBe(true); // hash[1]=0x100 < target[1]=0xfff
  });
});
