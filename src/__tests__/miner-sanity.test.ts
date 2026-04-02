import { describe, it, expect } from 'vitest';
import {
  canonicalV2Hash,
  extractCodeScriptHashOp,
  mapAlgorithmId,
  mapHashOpToAlgorithm,
  nonceBytesFromU32,
} from '../miner';
import { blake3 } from '@noble/hashes/blake3';
import { k12 } from '@noble/hashes/sha3-addons';

describe('Miner hash-op sanity helpers', () => {
  it('extracts sha256d hash opcode aa from codeScript', () => {
    const codeScript = '0011227ea87e5a7a7eaabc01147f3344';
    expect(extractCodeScriptHashOp(codeScript)).toBe('aa');
  });

  it('extracts blake3 hash opcode ee from codeScript', () => {
    const codeScript = 'deadbeef7ea87e5a7a7eeebc01147f00';
    expect(extractCodeScriptHashOp(codeScript)).toBe('ee');
  });

  it('extracts k12 hash opcode ef from codeScript', () => {
    const codeScript = 'cafebabe7ea87e5a7a7eefbc01147f';
    expect(extractCodeScriptHashOp(codeScript)).toBe('ef');
  });

  it('returns undefined for unmatched codeScript', () => {
    const codeScript = '001122334455';
    expect(extractCodeScriptHashOp(codeScript)).toBeUndefined();
  });

  it('maps hash opcodes to mining algorithms', () => {
    expect(mapHashOpToAlgorithm('aa')).toBe('sha256d');
    expect(mapHashOpToAlgorithm('ee')).toBe('blake3');
    expect(mapHashOpToAlgorithm('ef')).toBe('k12');
  });

  it('returns undefined for unknown hash opcode', () => {
    expect(mapHashOpToAlgorithm(undefined)).toBeUndefined();
  });

  it('maps only supported algo ids and rejects unknown ids', () => {
    expect(mapAlgorithmId(0x00)).toBe('sha256d');
    expect(mapAlgorithmId(0x01)).toBe('blake3');
    expect(mapAlgorithmId(0x02)).toBe('k12');
    expect(mapAlgorithmId(0x03)).toBeUndefined();
    expect(mapAlgorithmId(0xff)).toBeUndefined();
  });

  it('encodes nonce u32 into canonical nonce64 bytes', () => {
    const nonceBytes = nonceBytesFromU32(0x12345678);
    expect(Array.from(nonceBytes)).toEqual([
      0x78, 0x56, 0x34, 0x12,
      0x00, 0x00, 0x00, 0x00,
    ]);
  });

  it('canonicalV2Hash blake3 matches noble hash on prefix64||nonce64', () => {
    const prefix = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      prefix[i] = i;
    }
    const nonce = 0x12345678;
    const preimage = new Uint8Array(72);
    preimage.set(prefix);
    preimage.set(nonceBytesFromU32(nonce), 64);

    const expected = blake3(preimage);
    const actual = canonicalV2Hash('blake3', prefix, nonce);
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });

  it('canonicalV2Hash k12 matches noble hash on prefix64||nonce64', () => {
    const prefix = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      prefix[i] = 255 - i;
    }
    const nonce = 0x00000001;
    const preimage = new Uint8Array(72);
    preimage.set(prefix);
    preimage.set(nonceBytesFromU32(nonce), 64);

    const expected = k12(preimage, { dkLen: 32 });
    const actual = canonicalV2Hash('k12', prefix, nonce);
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });
});
