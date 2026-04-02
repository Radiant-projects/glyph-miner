import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export const NONCE_BYTES_V1 = 4;
export const NONCE_BYTES_V2 = 8;
export const NONCE_BYTES_SHA256D_V2 = 8; // 64-bit nonce for SHA256d efficiency

export function nonceBytesForContracts(nonceU32: number): Uint8Array {
  const buf = new Uint8Array(NONCE_BYTES_V2);
  const view = new DataView(buf.buffer);
  view.setUint32(0, nonceU32 >>> 0, true);
  view.setUint32(4, 0, true);
  return buf;
}

export function nonceHexForContracts(nonceU32: number): string {
  return bytesToHex(nonceBytesForContracts(nonceU32));
}

export function normalizeNonceHexForScriptSig(
  nonceHex: string,
  nonceBytes: 4 | 8,
): string {
  const normalized = nonceHex.trim().toLowerCase();
  const requiredHexLength = nonceBytes * 2;

  if (nonceBytes === NONCE_BYTES_V2 && normalized.length === 8) {
    return `${normalized}00000000`;
  }
  if (normalized.length === requiredHexLength) {
    return normalized;
  }
  if (normalized.length > requiredHexLength) {
    return normalized.substring(0, requiredHexLength);
  }
  return normalized.padStart(requiredHexLength, "0");
}

export function nonceU32FromLEHex(nonceHex: string): number {
  const normalized = normalizeNonceHexForScriptSig(nonceHex, NONCE_BYTES_V1);
  const bytes = hexToBytes(normalized);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true);
}

// 64-bit nonce support for SHA256d efficiency
export function nonceBytesForSha256d(nonceLow: number, nonceHigh: number = 0): Uint8Array {
  const buf = new Uint8Array(NONCE_BYTES_SHA256D_V2);
  const view = new DataView(buf.buffer);
  view.setUint32(0, nonceLow >>> 0, true);   // Low 32 bits (little-endian)
  view.setUint32(4, nonceHigh >>> 0, true);  // High 32 bits (little-endian)
  return buf;
}

export function nonceHexForSha256d(nonceLow: number, nonceHigh: number = 0): string {
  return bytesToHex(nonceBytesForSha256d(nonceLow, nonceHigh));
}

export function nonceU64FromBytes(bytes: Uint8Array): { low: number; high: number } {
  if (bytes.length !== 8) {
    throw new Error("Expected 8 bytes for 64-bit nonce");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    low: view.getUint32(0, true),
    high: view.getUint32(4, true)
  };
}

export function nonceU64FromHex(hex: string): { low: number; high: number } {
  const paddedHex = hex.padStart(16, '0').slice(0, 16);
  const bytes = hexToBytes(paddedHex);
  return nonceU64FromBytes(bytes);
}
