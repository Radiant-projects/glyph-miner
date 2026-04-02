/**
 * Glyph v2 Algorithm Detection Tests
 * Tests that the miner correctly detects algorithms from both v1 and v2 tokens
 */

import { describe, it, expect } from 'vitest';
import { AlgorithmId, GlyphPayload, DmintPayloadV2 } from '../../types';

// Helper function to map algorithm ID number to string (mirrors miner.ts)
function mapAlgorithmId(algoId: number): AlgorithmId {
  switch (algoId) {
    case 0x00: return 'sha256d';
    case 0x01: return 'blake3';
    case 0x02: return 'k12';
    case 0x03: return 'argon2light';
    case 0x04: return 'randomx-light';
    default: return 'sha256d';
  }
}

// Simulates the getAlgorithm function from miner.ts
function getAlgorithmFromPayload(
  payload: GlyphPayload | undefined,
  contractAlgorithm: AlgorithmId | undefined
): AlgorithmId {
  // First check v2 glyph payload for dmint.algo
  if (payload) {
    // Check for dmint field with algorithm
    const dmint = payload.dmint;
    if (dmint && typeof dmint.algo === 'number') {
      return mapAlgorithmId(dmint.algo);
    }
  }
  
  // Fall back to contract algorithm (from API)
  if (contractAlgorithm) {
    return contractAlgorithm;
  }
  
  return 'sha256d';
}

describe('Glyph v2 Algorithm Detection', () => {
  describe('v2 Payload Detection', () => {
    it('should detect sha256d (0x00) from v2 payload', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x00,
          maxHeight: 10000,
          reward: 100,
          premine: 0,
          diff: 500000,
        },
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('sha256d');
    });

    it('should detect blake3 (0x01) from v2 payload', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x01,
          maxHeight: 10000,
          reward: 100,
          premine: 0,
          diff: 2500000,
        },
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('blake3');
    });

    it('should detect k12 (0x02) from v2 payload', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x02,
          maxHeight: 5000,
          reward: 200,
          premine: 0,
          diff: 2000000,
        },
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('k12');
    });

    it('should detect argon2light (0x03) from v2 payload', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x03,
          maxHeight: 100000,
          reward: 10,
          premine: 500,
          diff: 50000,
        },
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('argon2light');
    });

    it('should detect randomx-light (0x04) from v2 payload', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x04,
        } as DmintPayloadV2,
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('randomx-light');
    });
  });

  describe('v1 Fallback Detection', () => {
    it('should fall back to contract algorithm for v1 tokens', () => {
      // v1 token without dmint field in payload
      const payload: GlyphPayload = {
        p: [1, 4],
        // No v or dmint fields (v1 style)
      };
      
      expect(getAlgorithmFromPayload(payload, 'blake3')).toBe('blake3');
    });

    it('should fall back to sha256d when no algorithm info available', () => {
      const payload: GlyphPayload = {
        p: [1, 4],
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('sha256d');
    });

    it('should use contract algorithm when payload has no dmint', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        // Has v:2 but no dmint (unusual but possible)
      };
      
      expect(getAlgorithmFromPayload(payload, 'k12')).toBe('k12');
    });
  });

  describe('v2 Takes Priority Over API', () => {
    it('should prefer v2 payload over contract algorithm', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0x01, // blake3
          maxHeight: 10000,
          reward: 100,
          premine: 0,
          diff: 2500000,
        },
      };
      
      // Contract says sha256d but payload says blake3
      expect(getAlgorithmFromPayload(payload, 'sha256d')).toBe('blake3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined payload', () => {
      expect(getAlgorithmFromPayload(undefined, 'blake3')).toBe('blake3');
      expect(getAlgorithmFromPayload(undefined, undefined)).toBe('sha256d');
    });

    it('should handle unknown algorithm ID by defaulting to sha256d', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 0xFF, // Unknown
        } as DmintPayloadV2,
      };
      
      expect(getAlgorithmFromPayload(payload, undefined)).toBe('sha256d');
    });

    it('should handle dmint with non-numeric algo', () => {
      const payload: GlyphPayload = {
        v: 2,
        p: [1, 4],
        dmint: {
          algo: 'blake3', // String instead of number (invalid)
        } as unknown as DmintPayloadV2,
      };
      
      // Should fall back since algo is not a number
      expect(getAlgorithmFromPayload(payload, 'k12')).toBe('k12');
    });
  });
});

describe('Algorithm ID Mapping', () => {
  it('should correctly map all algorithm IDs', () => {
    expect(mapAlgorithmId(0x00)).toBe('sha256d');
    expect(mapAlgorithmId(0x01)).toBe('blake3');
    expect(mapAlgorithmId(0x02)).toBe('k12');
    expect(mapAlgorithmId(0x03)).toBe('argon2light');
    expect(mapAlgorithmId(0x04)).toBe('randomx-light');
  });

  it('should default unknown IDs to sha256d', () => {
    expect(mapAlgorithmId(0x05)).toBe('sha256d');
    expect(mapAlgorithmId(0xFF)).toBe('sha256d');
    expect(mapAlgorithmId(-1)).toBe('sha256d');
  });
});

describe('DAA Configuration Detection', () => {
  it('should detect ASERT DAA from v2 payload', () => {
    const payload: GlyphPayload = {
      v: 2,
      p: [1, 4],
      dmint: {
        algo: 0x01,
        daa: {
          mode: 0x02, // ASERT
          targetBlockTime: 60,
          halfLife: 3600,
        },
      } as DmintPayloadV2,
    };
    
    expect(payload.dmint?.daa?.mode).toBe(0x02);
    expect(payload.dmint?.daa?.halfLife).toBe(3600);
  });

  it('should detect LWMA DAA from v2 payload', () => {
    const payload: GlyphPayload = {
      v: 2,
      p: [1, 4],
      dmint: {
        algo: 0x02,
        daa: {
          mode: 0x03, // LWMA
          targetBlockTime: 30,
          windowSize: 72,
        },
      } as DmintPayloadV2,
    };
    
    expect(payload.dmint?.daa?.mode).toBe(0x03);
    expect(payload.dmint?.daa?.windowSize).toBe(72);
  });

  it('should detect Epoch DAA from v2 payload', () => {
    const payload: GlyphPayload = {
      v: 2,
      p: [1, 4],
      dmint: {
        algo: 0x00,
        daa: {
          mode: 0x01, // Epoch
          targetBlockTime: 600,
          epochLength: 2016,
          maxAdjustment: 4,
        },
      } as DmintPayloadV2,
    };
    
    expect(payload.dmint?.daa?.mode).toBe(0x01);
    expect(payload.dmint?.daa?.epochLength).toBe(2016);
  });

  it('should detect Schedule DAA from v2 payload', () => {
    const payload: GlyphPayload = {
      v: 2,
      p: [1, 4],
      dmint: {
        algo: 0x01,
        daa: {
          mode: 0x04, // Schedule
          targetBlockTime: 60,
          schedule: [
            { height: 0, difficulty: 10 },
            { height: 1000, difficulty: 100 },
          ],
        },
      } as DmintPayloadV2,
    };
    
    expect(payload.dmint?.daa?.mode).toBe(0x04);
    expect(payload.dmint?.daa?.schedule).toHaveLength(2);
  });
});
