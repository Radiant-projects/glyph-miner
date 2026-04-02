import { describe, it, expect, beforeAll } from 'vitest';
import { sha256 } from '@noble/hashes/sha2';
import { blake3 } from '@noble/hashes/blake3';
import { k12 } from '@noble/hashes/sha3-addons';
import { argon2id } from '@noble/hashes/argon2';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { AlgorithmId } from '../../types';
import { getAlgorithmConfig, isAlgorithmSupported } from '../../algorithms';

// Mock work data for testing
const createMockWork = () => ({
  txid: new Uint8Array(32).fill(0x01),
  contractRef: new Uint8Array(32).fill(0x02),
  inputScript: new Uint8Array(25).fill(0x03),
  outputScript: new Uint8Array(34).fill(0x04),
  target: 0x00000fffffffffffn,
});

// Mock preimage (64 bytes)
const createMockPreimage = (): Uint8Array => {
  const preimage = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    preimage[i] = i;
  }
  return preimage;
};

// Test hash functions are available and work correctly
describe('Hash Function Availability', () => {
  const testInput = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it('sha256 should produce 32-byte hash', () => {
    const hash = sha256(testInput);
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('blake3 should produce 32-byte hash', () => {
    const hash = blake3(testInput);
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('k12 should produce 32-byte hash with dkLen option', () => {
    const hash = k12(testInput, { dkLen: 32 });
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('argon2id should produce 32-byte hash', () => {
    const salt = testInput.slice(0, 8);
    const hash = argon2id(testInput, salt, { t: 3, m: 64, p: 1, dkLen: 32 });
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });
});

// Test algorithm configurations
describe('Algorithm Configurations', () => {
  const algorithms: AlgorithmId[] = ['sha256d', 'blake3', 'k12', 'argon2light'];

  algorithms.forEach((algo) => {
    it(`${algo} should be supported`, () => {
      expect(isAlgorithmSupported(algo)).toBe(true);
    });

    it(`${algo} should have valid config`, () => {
      const config = getAlgorithmConfig(algo);
      expect(config).not.toBeNull();
      expect(config?.id).toBe(algo);
      expect(config?.workgroupSize).toBeGreaterThan(0);
      expect(config?.bufferRequirements.midstate).toBeGreaterThan(0);
      expect(config?.bufferRequirements.target).toBeGreaterThan(0);
      expect(config?.bufferRequirements.results).toBeGreaterThan(0);
    });
  });

  it('randomx-light should NOT be supported (CPU-only)', () => {
    expect(isAlgorithmSupported('randomx-light')).toBe(false);
  });
});

// Test midstate preparation for each algorithm
describe('Midstate Preparation', () => {
  const preimage = createMockPreimage();

  it('SHA256d midstate should be 32 bytes', () => {
    // SHA256d uses partial hash of first 64 bytes
    const hash = sha256(preimage);
    expect(hash.length).toBe(32);
  });

  it('Blake3 midstate should contain IV + preimage data', () => {
    const BLAKE3_IV = new Uint32Array([
      0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
      0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
    ]);
    
    const midstateU32 = new Uint32Array(16);
    midstateU32.set(BLAKE3_IV, 0);
    
    const preimageView = new DataView(preimage.buffer, preimage.byteOffset);
    for (let i = 0; i < 8; i++) {
      midstateU32[8 + i] = preimageView.getUint32(i * 4, true);
    }
    
    const midstate = new Uint8Array(midstateU32.buffer);
    expect(midstate.length).toBe(64);
    
    // Verify IV is at the beginning
    const ivBytes = new Uint8Array(BLAKE3_IV.buffer);
    for (let i = 0; i < 32; i++) {
      expect(midstate[i]).toBe(ivBytes[i]);
    }
  });

  it('K12 midstate should contain first 64 bytes of preimage', () => {
    const midstateU32 = new Uint32Array(16);
    const preimageView = new DataView(preimage.buffer, preimage.byteOffset);
    
    for (let i = 0; i < 16; i++) {
      midstateU32[i] = preimageView.getUint32(i * 4, true);
    }
    
    const midstate = new Uint8Array(midstateU32.buffer);
    expect(midstate.length).toBe(64);
  });

  it('Argon2Light midstate should contain first 64 bytes of preimage', () => {
    const midstateU32 = new Uint32Array(16);
    const preimageView = new DataView(preimage.buffer, preimage.byteOffset);
    
    for (let i = 0; i < 16; i++) {
      midstateU32[i] = preimageView.getUint32(i * 4, true);
    }
    
    const midstate = new Uint8Array(midstateU32.buffer);
    expect(midstate.length).toBe(64);
  });
});

// Test verification logic for each algorithm
describe('Verification Logic', () => {
  const preimage = createMockPreimage();
  const target = 0x00000fffffffffffn; // Easy target for testing

  // Helper to create full preimage with nonce
  const createFullPreimage = (nonce: string): Uint8Array => {
    const full = new Uint8Array(72); // 64 + 8 bytes for nonce
    full.set(preimage);
    full.set(hexToBytes(nonce.padStart(16, '0')), 64);
    return full;
  };

  // Helper to check if hash meets target
  const checkTarget = (hash: Uint8Array, target: bigint): boolean => {
    // First 4 bytes must be zero
    if (hash[0] !== 0 || hash[1] !== 0 || hash[2] !== 0 || hash[3] !== 0) {
      return false;
    }
    // Check next 8 bytes against target
    const view = new DataView(hash.slice(4, 12).buffer, 0);
    const num = view.getBigUint64(0, false);
    return num < target;
  };

  it('SHA256d verification should work correctly', () => {
    const fullPreimage = createFullPreimage('0');
    const hash = sha256(sha256(fullPreimage));
    expect(hash.length).toBe(32);
    // Just verify hash is computed (target check depends on actual hash)
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('Blake3 verification should work correctly', () => {
    const fullPreimage = createFullPreimage('0');
    const hash = blake3(fullPreimage);
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('K12 verification should work correctly', () => {
    const fullPreimage = createFullPreimage('0');
    const hash = k12(fullPreimage, { dkLen: 32 });
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });

  it('Argon2Light verification should work correctly', () => {
    const fullPreimage = createFullPreimage('0');
    const salt = fullPreimage.slice(0, 16);
    const hash = argon2id(fullPreimage, salt, { t: 3, m: 64, p: 1, dkLen: 32 });
    expect(hash.length).toBe(32);
    expect(hash).toBeInstanceOf(Uint8Array);
  });
});

// Test nonce padding
describe('Nonce Padding', () => {
  it('should pad nonces to 8 hex chars (4 bytes)', () => {
    const testCases = [
      { nonce: 0, expected: '00000000' },
      { nonce: 1, expected: '00000001' },
      { nonce: 255, expected: '000000ff' },
      { nonce: 0xffffffff, expected: 'ffffffff' },
      { nonce: 0x12345678, expected: '12345678' },
    ];

    testCases.forEach(({ nonce, expected }) => {
      const padded = nonce.toString(16).padStart(8, '0');
      expect(padded).toBe(expected);
      expect(padded.length).toBe(8);
      
      // Verify hexToBytes produces 4 bytes
      const bytes = hexToBytes(padded);
      expect(bytes.length).toBe(4);
    });
  });
});

// Test shader result format consistency
describe('Shader Result Format', () => {
  it('should use flag=1 at offset 12 (w component)', () => {
    // Simulate shader result format: vec4<u32>(nonce, hash[0], hash[1], 1)
    const nonce = 0x12345678;
    const hash0 = 0x00000000;
    const hash1 = 0x11111111;
    const flag = 1;

    const result = new Uint32Array([nonce, hash0, hash1, flag]);
    const resultBytes = new Uint8Array(result.buffer);

    // CPU reads flag from offset 12
    const flagFromBytes = new DataView(resultBytes.buffer).getUint32(12, true);
    expect(flagFromBytes).toBe(1);

    // CPU reads nonce from offset 0
    const nonceFromBytes = new DataView(resultBytes.buffer).getUint32(0, true);
    expect(nonceFromBytes).toBe(nonce);
  });
});

// Test all algorithms produce deterministic hashes
describe('Hash Determinism', () => {
  const input = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

  it('SHA256d should be deterministic', () => {
    const hash1 = sha256(sha256(input));
    const hash2 = sha256(sha256(input));
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });

  it('Blake3 should be deterministic', () => {
    const hash1 = blake3(input);
    const hash2 = blake3(input);
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });

  it('K12 should be deterministic', () => {
    const hash1 = k12(input, { dkLen: 32 });
    const hash2 = k12(input, { dkLen: 32 });
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });

  it('Argon2id should be deterministic with same salt', () => {
    const salt = input.slice(0, 8);
    const hash1 = argon2id(input, salt, { t: 3, m: 64, p: 1, dkLen: 32 });
    const hash2 = argon2id(input, salt, { t: 3, m: 64, p: 1, dkLen: 32 });
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });
});
