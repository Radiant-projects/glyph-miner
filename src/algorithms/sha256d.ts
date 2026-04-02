import { AlgorithmConfig } from './types';
// Note: Shader will be loaded directly in miner.ts

export const sha256dConfig: AlgorithmConfig = {
  id: 'sha256d',
  shaderCode: '', // Will be loaded dynamically
  workgroupSize: 256,
  bufferRequirements: {
    midstate: 16, // 16 u32s (64 bytes) for midstate
    target: 8,   // 8 u32s for target
    results: 256, // 256 vec4<u32>s for results
  },
};

export function prepareSha256dWork(_work: any): Uint8Array {
  // Create midstate for SHA256d
  // This is a simplified version - actual implementation needs proper midstate calculation
  const midstate = new Uint8Array(64);
  
  // Copy txid, contractRef, inputScript, outputScript into midstate
  // This is where the actual midstate calculation would happen
  // For now, we'll use a placeholder
  
  return midstate;
}

export function verifySha256d(hash: Uint8Array, target: bigint): boolean {
  // Convert hash to bigint and compare with target
  let hashBig = 0n;
  for (let i = 0; i < hash.length; i++) {
    hashBig = (hashBig << 8n) | BigInt(hash[i]);
  }
  
  return hashBig < target;
}
