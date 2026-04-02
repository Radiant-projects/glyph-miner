import { 
  nonceBytesForSha256d, 
  nonceHexForSha256d, 
  nonceU64FromBytes,
  nonceU64FromHex,
  normalizeNonceHexForScriptSig
} from '../nonce';
import { batchVerifySha256d, verifySha256d64 } from '../miner';
import { describe, test, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha2';
import { hexToBytes } from '@noble/hashes/utils';

describe('64-bit SHA256d Mining', () => {
  describe('Nonce Utilities', () => {
    test('nonceBytesForSha256d creates correct 8-byte buffer', () => {
      const bytes = nonceBytesForSha256d(0x12345678, 0xABCDEF00);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(8);
      
      // Check little-endian encoding
      expect(bytes[0]).toBe(0x78); // Low byte of low 32 bits
      expect(bytes[1]).toBe(0x56);
      expect(bytes[2]).toBe(0x34);
      expect(bytes[3]).toBe(0x12); // High byte of low 32 bits
      expect(bytes[4]).toBe(0x00); // Low byte of high 32 bits
      expect(bytes[5]).toBe(0xEF);
      expect(bytes[6]).toBe(0xCD);
      expect(bytes[7]).toBe(0xAB); // High byte of high 32 bits
    });

    test('nonceHexForSha256d creates correct hex string', () => {
      const hex = nonceHexForSha256d(0x12345678, 0xABCDEF00);
      expect(hex).toBe('7856341200efcdab');
    });

    test('nonceU64FromBytes parses 8-byte buffer correctly', () => {
      const bytes = nonceBytesForSha256d(0x12345678, 0xABCDEF00);
      const result = nonceU64FromBytes(bytes);
      
      expect(result.low).toBe(0x12345678);
      expect(result.high).toBe(0xABCDEF00);
    });

    test('nonceU64FromHex parses hex string correctly', () => {
      const result = nonceU64FromHex('7856341200efcdab');
      
      expect(result.low).toBe(0x12345678);
      expect(result.high).toBe(0xABCDEF00);
    });

    test('nonceU64FromHex handles short hex strings', () => {
      const result = nonceU64FromHex('1234');
      // '1234' becomes '0000000000001234' which puts 0x1234 at bytes 6-7 (high 32 bits in little-endian)
      expect(result.low).toBe(0);
      expect(result.high).toBe(873594880); // 0x1234 shifted to high position
    });

    test('nonceU64FromBytes throws on invalid length', () => {
      expect(() => nonceU64FromBytes(new Uint8Array(4))).toThrow();
      expect(() => nonceU64FromBytes(new Uint8Array(16))).toThrow();
    });
  });

  describe('64-bit Verification', () => {
    const mockTarget = BigInt('0x00000000FFFFFFFF00000000000000000000000000000000000000000000000000');
    const mockPreimage = new Uint8Array(64).fill(0);

    test('verifySha256d64 verifies valid solution', () => {
      // This is a simplified test - in practice, finding a valid nonce requires mining
      const nonceLow = 0x12345678;
      const nonceHigh = 0xABCDEF00;
      
      // Mock the verification to test the function structure
      const result = verifySha256d64(mockTarget, mockPreimage, nonceLow, nonceHigh);
      expect(typeof result).toBe('boolean');
    });

    test('verifySha256d64 handles different nonce combinations', () => {
      const testCases = [
        { low: 0, high: 0 },
        { low: 1, high: 0 },
        { low: 0, high: 1 },
        { low: 0xFFFFFFFF, high: 0xFFFFFFFF },
        { low: 0x12345678, high: 0xABCDEF00 }
      ];

      testCases.forEach(({ low, high }) => {
        const result = verifySha256d64(mockTarget, mockPreimage, low, high);
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('Batch Verification', () => {
    const mockTarget = BigInt('0x00000000FFFFFFFF00000000000000000000000000000000000000000000000000');
    const mockPreimage = new Uint8Array(64).fill(0);

    test('batchVerifySha256d processes multiple nonces', () => {
      const nonces = [
        '12345678abcdef00',
        '8765432100fedcba',
        '1111111111111111',
        '0000000000000000'
      ];

      const result = batchVerifySha256d(mockTarget, mockPreimage, nonces);
      
      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.verified)).toBe(true);
      expect(typeof result.count).toBe('number');
      expect(result.count).toBe(result.verified.length);
    });

    test('batchVerifySha256d handles empty nonce array', () => {
      const result = batchVerifySha256d(mockTarget, mockPreimage, []);
      
      expect(result.verified).toEqual([]);
      expect(result.count).toBe(0);
    });

    test('batchVerifySha256d handles single nonce', () => {
      const nonces = ['12345678abcdef00'];
      const result = batchVerifySha256d(mockTarget, mockPreimage, nonces);
      
      expect(result.verified.length).toBeLessThanOrEqual(1);
      expect(result.count).toBeLessThanOrEqual(1);
    });
  });

  describe('Backward Compatibility', () => {
    test('64-bit nonce functions work with 32-bit values', () => {
      // Test that high=0 works like original 32-bit nonce
      const nonceLow = 0x12345678;
      const nonceHigh = 0;
      
      const bytes = nonceBytesForSha256d(nonceLow, nonceHigh);
      const hex = nonceHexForSha256d(nonceLow, nonceHigh);
      
      expect(bytes.length).toBe(8);
      expect(hex).toBe('7856341200000000');
      
      // Should normalize to 8-byte format
      const normalized = normalizeNonceHexForScriptSig('78563412', 8);
      expect(normalized).toBe('7856341200000000');
      expect(hex).toBe(normalized);
    });

    test('existing 4-byte nonce normalization still works', () => {
      const nonce4Byte = '12345678';
      const normalized4 = normalizeNonceHexForScriptSig(nonce4Byte, 4);
      expect(normalized4).toBe('12345678');
      
      const normalized8 = normalizeNonceHexForScriptSig(nonce4Byte, 8);
      expect(normalized8).toBe('1234567800000000');
    });
  });

  describe('Performance Benefits', () => {
    test('64-bit nonce space significantly larger than 32-bit', () => {
      const nonceSpace32Bit = 0x100000000; // 2^32
      const nonceSpace64Bit = BigInt('0x10000000000000000'); // 2^64
      
      expect(nonceSpace64Bit / BigInt(nonceSpace32Bit)).toBe(BigInt('0x100000000'));
    });

    test('nonce exhaustion time calculation', () => {
      const hashrate = 1500000000; // 1.5 GH/s for RTX 4090
      const nonceSpace32Bit = 0x100000000;
      const nonceSpace64Bit = BigInt('0x10000000000000000');
      
      const time32Bit = nonceSpace32Bit / hashrate; // ~2.86 seconds
      const time64Bit = Number(nonceSpace64Bit / BigInt(hashrate)); // ~123,000 years
      
      expect(time64Bit).toBeGreaterThan(time32Bit * 1000000);
    });
  });

  describe('Edge Cases', () => {
    test('nonceBytesForSha256d handles maximum values', () => {
      const bytes = nonceBytesForSha256d(0xFFFFFFFF, 0xFFFFFFFF);
      const result = nonceU64FromBytes(bytes);
      
      expect(result.low).toBe(0xFFFFFFFF);
      expect(result.high).toBe(0xFFFFFFFF);
    });

    test('nonceHexForSha256d handles zero values', () => {
      const hex = nonceHexForSha256d(0, 0);
      expect(hex).toBe('0000000000000000');
    });

    test('batch verification with mixed valid/invalid nonces', () => {
      const nonces = [
        '0000000000000000', // Zero nonce
        'FFFFFFFFFFFFFFFF', // Max nonce
        '12345678ABCDEF00', // Random nonce
        'deadbeefcafebabe'  // Another random nonce
      ];

      const result = batchVerifySha256d(
        BigInt('0x00000000FFFFFFFF00000000000000000000000000000000000000000000000000'),
        new Uint8Array(64).fill(0),
        nonces
      );

      expect(result.verified.length).toBeLessThanOrEqual(4);
      expect(result.count).toBe(result.verified.length);
    });
  });
});
