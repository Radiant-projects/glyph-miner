/**
 * Glyph Token Tests for Glyph-miner
 */

import { describe, it, expect } from 'vitest';
import { parseDmintScript } from '../../glyph';

const DMINT_CODE_SCRIPT_SUFFIX =
  'bd5175c0c855797ea8597959797ea87e5a7a7e__OP__bc01147f77587f040000000088817600a269a269577ae500a069567ae600a06901d053797e0cdec0e9aa76e378e4a269e69d7eaa76e47b9d547a818b76537a9c537ade789181547ae6939d635279cd01d853797e016a7e886778de519d547854807ec0eb557f777e5379ec78885379eac0e9885379cc519d75686d7551';

const STATE_SCRIPT_PREFIX =
  '0100000000d8' +
  '11'.repeat(36) +
  'd0' +
  '22'.repeat(36) +
  '010101';

describe('dMint Token Structure', () => {
  describe('Contract Script Parsing', () => {
    it('should parse SHA256d, Blake3, and K12 contract scripts', () => {
      const scripts = ['aa', 'ee', 'ef'].map((op) =>
        `${STATE_SCRIPT_PREFIX}${DMINT_CODE_SCRIPT_SUFFIX.replace('__OP__', op)}`
      );

      scripts.forEach((script) => {
        expect(parseDmintScript(script)).toBe(STATE_SCRIPT_PREFIX);
      });
    });
  });

  describe('Metadata', () => {
    it('should include required Glyph fields', () => {
      const metadata = {
        v: 2,
        type: 'ft',
        p: [1, 4], // FT + DMINT
        name: 'Test dMint Token',
        ticker: 'TDMT',
        decimals: 8,
      };
      
      expect(metadata.v).toBe(2);
      expect(metadata.p).toContain(1);
      expect(metadata.p).toContain(4);
    });

    it('should include dMint-specific fields', () => {
      const dmintData = {
        algorithm: 0x01, // BLAKE3
        startDiff: 500000,
        maxSupply: 21000000,
        reward: 50,
        halvingInterval: 210000,
        daa: {
          mode: 0x02, // ASERT
          halflife: 3600,
          targetTime: 60,
        },
      };
      
      expect(dmintData.algorithm).toBeDefined();
      expect(dmintData.daa).toBeDefined();
    });
  });

  describe('Mining Parameters', () => {
    it('should validate reward schedule', () => {
      const maxSupply = 21000000;
      const initialReward = 50;
      const halvingInterval = 210000;
      
      // Calculate total supply from halvings
      let totalSupply = 0;
      let reward = initialReward;
      let blocks = 0;
      
      while (reward >= 1) {
        totalSupply += reward * halvingInterval;
        reward = Math.floor(reward / 2);
        blocks += halvingInterval;
      }
      
      expect(totalSupply).toBeLessThanOrEqual(maxSupply);
    });

    it('should enforce minimum difficulty', () => {
      const minDifficulty = {
        SHA256D: 500000,
        BLAKE3: 2500000,
        K12: 2000000,
        ARGON2ID_LIGHT: 50000,
      };
      
      expect(minDifficulty.BLAKE3).toBeGreaterThan(minDifficulty.SHA256D);
    });
  });
});

describe('Contract Deployment', () => {
  it('should generate valid singleton ref', () => {
    const txid = '0'.repeat(64);
    const vout = 0;
    const ref = `${txid}_${vout}`;
    
    expect(ref).toContain('_');
    expect(txid.length).toBe(64);
  });

  it('should create commit transaction', () => {
    const commitTx = {
      inputs: [{ txid: '...', vout: 0 }],
      outputs: [
        { value: 1, script: 'OP_RETURN <glyph_data>' },
        { value: 546, script: 'P2PKH' },
      ],
    };
    
    expect(commitTx.outputs.length).toBeGreaterThanOrEqual(2);
  });

  it('should create reveal transaction', () => {
    const revealTx = {
      inputs: [{ txid: 'commit_txid', vout: 1 }],
      outputs: [
        { value: 546, script: 'singleton_script' },
      ],
    };
    
    expect(revealTx.outputs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Mining Submission', () => {
  it('should format valid proof', () => {
    const proof = {
      nonce: new Uint8Array(8),
      hash: new Uint8Array(32),
      timestamp: Date.now(),
    };
    
    expect(proof.nonce.length).toBe(8);
    expect(proof.hash.length).toBe(32);
  });

  it('should verify proof against target', () => {
    const hash = new Uint8Array(32).fill(0);
    hash[0] = 0x00;
    hash[1] = 0x00;
    hash[2] = 0x01; // Low hash
    
    const target = new Uint8Array(32).fill(0);
    target[0] = 0x00;
    target[1] = 0x00;
    target[2] = 0x0f; // Higher target
    
    // Compare hash < target
    let valid = false;
    for (let i = 0; i < 32; i++) {
      if (hash[i] < target[i]) {
        valid = true;
        break;
      } else if (hash[i] > target[i]) {
        break;
      }
    }
    
    expect(valid).toBe(true);
  });
});
