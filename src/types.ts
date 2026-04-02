import { PrivateKey } from "@radiantblockchain/radiantjs";

/**
 * Glyph v2 Token Standard Types
 * Reference: https://github.com/Radiant-Core/Glyph-Token-Standards
 */

// Protocol version
export const GLYPH_VERSION = 2;

// Protocol IDs per Glyph v2 spec
export const GlyphProtocol = {
  GLYPH_FT: 1,
  GLYPH_NFT: 2,
  GLYPH_DAT: 3,
  GLYPH_DMINT: 4,
  GLYPH_MUT: 5,
  GLYPH_BURN: 6,
  GLYPH_CONTAINER: 7,
  GLYPH_ENCRYPTED: 8,
  GLYPH_TIMELOCK: 9,
  GLYPH_AUTHORITY: 10,
  GLYPH_WAVE: 11,
} as const;

export type GlyphProtocolId = typeof GlyphProtocol[keyof typeof GlyphProtocol];

// Algorithm IDs per Glyph v2 dMint spec (REP-3010)
export const DmintAlgorithmId = {
  SHA256D: 0x00,
  BLAKE3: 0x01,
  K12: 0x02,
  ARGON2ID_LIGHT: 0x03,
  RANDOMX_LIGHT: 0x04,
} as const;

export type AlgorithmId = 'sha256d' | 'blake3' | 'k12' | 'argon2light' | 'randomx-light';

// DAA Mode IDs per Glyph v2 dMint spec
export const DaaModeId = {
  FIXED: 0x00,
  EPOCH: 0x01,
  ASERT: 0x02,
  LWMA: 0x03,
  SCHEDULE: 0x04,
} as const;

export type DAAMode = 'fixed' | 'epoch' | 'asert' | 'lwma' | 'schedule';

export type Contract = {
  location: string;
  outputIndex: number;
  height: bigint;
  contractRef: string;
  tokenRef: string;
  maxHeight: bigint;
  reward: bigint;
  target: bigint;
  algoId?: bigint;
  lastTime?: bigint;
  targetTime?: bigint;
  script: string;
  codeScript?: string;
  message: string;
  // Enhanced contract fields
  algorithm?: AlgorithmId;
  daaMode?: DAAMode;
  daaParams?: any;
};

export type ContractGroup = {
  glyph: Glyph;
  summary: TokenSummary;
  contracts: Contract[];
};

export type TokenSummary = {
  numContracts: number;
  totalSupply: bigint;
  mintedSupply: bigint;
};

// DAA parameter types per mode (V2_DMINT_DESIGN.md §3.5)
export type DaaParamsFixed = Record<string, never>;

export type DaaParamsEpoch = {
  epochLength: number;    // Mints per adjustment epoch (default 2016)
  maxAdjustment: number;  // Max adjustment factor per epoch (default 4.0)
};

export type DaaParamsAsert = {
  targetTime: number;     // Target seconds between mints (default 60)
  halfLife: number;       // Half-life in seconds (default 3600)
};

export type DaaParamsLwma = {
  targetTime: number;     // Target seconds between mints (default 60)
  windowSize: number;     // Number of recent mints to average (default 45)
};

export type DaaParamsSchedule = {
  schedule: { h: number; d: number }[]; // Ordered [{height, difficulty}] breakpoints
};

export type DaaParams = DaaParamsFixed | DaaParamsEpoch | DaaParamsAsert | DaaParamsLwma | DaaParamsSchedule;

export type DaaConfig = {
  mode: number;           // DAA mode: 0x00=fixed, 0x01=epoch, 0x02=asert, 0x03=lwma, 0x04=schedule
  params: DaaParams;
};

// Glyph v2 dMint payload structure (V2_DMINT_DESIGN.md §3.2)
export type DmintPayloadV2 = {
  algo: number;           // Algorithm ID: 0x00=sha256d, 0x01=blake3, 0x02=k12, 0x03=argon2light
  maxHeight: number;      // Maximum mint count
  reward: number;         // Photons per mint
  premine?: number;       // Creator premine amount (default 0)
  diff: number;           // Initial difficulty (target divisor)
  daa?: DaaConfig;        // DAA configuration (default: fixed)
};

export type GlyphPayload = {
  v?: number;             // Glyph version (2 for v2)
  p?: number[];           // Protocol IDs
  in?: Uint8Array[];
  by?: Uint8Array[];
  dmint?: DmintPayloadV2; // v2 dMint configuration
  [key: string]: unknown;
};

export type Glyph = {
  payload: GlyphPayload;
  files: { [key: string]: { t: string; b: Uint8Array } };
};

export type Token = {
  contract: Contract;
  glyph: Glyph;
};

export type Work = {
  txid: Uint8Array;
  contractRef: Uint8Array;
  inputScript: Uint8Array;
  outputScript: Uint8Array;
  target: bigint;
  algorithm?: AlgorithmId;
};

export type Wallet = {
  mnemonic: string;
  privKey: PrivateKey;
  address: string;
};

export type Utxo = {
  tx_hash: string;
  tx_pos: number;
  value: number;
  refs?: { ref: string; type: "single" | "normal" }[];
};

export type Message = {
  id: string;
  date: string;
} & (
  | {
      type: "found";
      nonce: string;
    }
  | {
      type: "accept";
      nonce: string;
      txid: string;
      msg: string;
    }
  | {
      type: "reject";
      nonce: string;
      reason?: string;
    }
  | {
      type: "general";
      msg: string;
    }
  | {
      type: "new-location";
      txid: string;
      msg: string;
    }
  | {
      type: "loaded" | "minted-out";
      ref: string;
      msg: string;
    }
  | {
      type: "not-found";
      ref: string;
    }
  | {
      type: "mint-time";
      seconds: number;
    }
  | {
      type: "start" | "stop";
    }
);
