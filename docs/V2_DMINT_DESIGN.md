# Glyph v2 dMint Design Specification

**Version:** 2.0  
**Date:** February 2026  
**Status:** Draft — Updated for Hard Fork (on-chain PoW for all algorithms)  
**Depends on:** Glyph v2 Token Standard Whitepaper, REP-3010, Radiant V2 Hard Fork  
**Master Plan:** [Radiant V2 Hard Fork Upgrade Plan](../../../Desktop/Misc%20Ecosystem%20Documents/Radiant_V2_Hard_Fork_Upgrade_Plan.md)  

---

## 1. Overview

This document defines the exact byte layout, CBOR metadata format, contract variants,
indexer behavior, and miner integration for Glyph v2 decentralized minting (dMint).

### 1.1 Design Constraints

1. **v1 backward compatibility**: Existing v1 dMint tokens MUST continue to work unchanged
2. **Fully on-chain PoW**: Hard fork adds `OP_BLAKE3` (0xee) and `OP_K12` (0xef) opcodes,
   enabling on-chain validation for all supported algorithms
3. **On-chain DAA**: `OP_LSHIFT`/`OP_RSHIFT` enabled in hard fork, allowing ASERT-lite
   difficulty adjustment computed entirely in script
4. **Nonce format**: 8 bytes (2×u32) — proven in v1 implementation
5. **Trustless**: No indexer dependency for PoW validation or DAA — indexer is analytics only
6. **No griefing**: On-chain PoW prevents state consumption without valid work

### 1.2 Contract Variants

| Variant | PoW On-Chain | Algorithms | DAA | Use Case |
|---------|-------------|------------|-----|----------|
| **v1 contract** | SHA256d (OP_HASH256) | SHA256d only | Fixed | v1 tokens, v2 SHA256d fixed |
| **v2-sha256d** | SHA256d (OP_HASH256) | SHA256d | On-chain | v2 SHA256d with DAA |
| **v2-blake3** | Blake3 (OP_BLAKE3) | Blake3 | On-chain | v2 Blake3 tokens |
| **v2-k12** | K12 (OP_K12) | KangarooTwelve | On-chain | v2 K12 tokens |

---

## 2. v1 dMint On-Chain Layout (Reference)

### 2.1 Contract Output Script

```
┌─────────────────────── State Data ───────────────────────┐
│ <height:4B>                                              │
│ OP_PUSHINPUTREFSINGLETON(d8) <contractRef:36B>           │
│ OP_PUSHINPUTREF(d0) <tokenRef:36B>                       │
│ <maxHeight:minimal>                                      │
│ <reward:minimal>                                         │
│ <target:minimal>                                         │
├─────────────────────── Separator ────────────────────────┤
│ OP_STATESEPARATOR(bd)                                    │
├─────────────────────── Bytecode ─────────────────────────┤
│ <v1_contract_bytecode> (fixed, validates SHA256d PoW     │
│  + state transitions + token rewards)                    │
└──────────────────────────────────────────────────────────┘
```

### 2.2 v1 Contract Bytecode (Hex)

```
5175c0c855797ea8597959797ea87e5a7a7eaabc01147f77587f
040000000088817600a269a269577ae500a069567ae600a06901
d053797e0cdec0e9aa76e378e4a269e69d7eaa76e47b9d547a81
8b76537a9c537ade789181547ae6939d635279cd01d853797e01
6a7e886778de519d547854807ec0eb557f777e5379ec78885379
eac0e9885379cc519d75686d7551
```

### 2.3 v1 Contract Bytecode Validation

The bytecode enforces:
1. **SHA256d PoW**: `hash = SHA256d(preimage + nonce)`, first 4 bytes must be `00000000`,
   remaining bytes checked against `target`
2. **Height increment**: `new_height = old_height + 1`
3. **Singleton preservation**: contractRef singleton maintained across spend
4. **Token distribution**: tokenRef output created with correct reward value
5. **Script continuity**: output script matches input script (except height)

### 2.4 v1 State Data Parsing

```typescript
// From glyph.ts:parseContractTx
const opcodes = Script.fromHex(stateScript).toASM().split(" ");
const [op1, contractRef] = opcodes.splice(1, 2); // OP_PUSHINPUTREFSINGLETON, ref
const [op2, tokenRef] = opcodes.splice(1, 2);    // OP_PUSHINPUTREF, ref
const [height, maxHeight, reward, target] = opcodes.map(opcodeToNum);
```

### 2.5 v1 Mining Preimage

```
preimage = SHA256(txid || contractRef) || SHA256(SHA256d(inputScript) || SHA256d(outputScript))
```

64 bytes total. Midstate = SHA256 partial hash of first 512-bit block (preimage).

### 2.6 v1 Nonce Format

```
nonce = nonce1(4B random) || nonce2(4B thread-varying)
```

8 bytes total. GPU shader increments `nonce2` per thread (`nonce[1] + id.x`).

### 2.7 v1 Solution Check

```
hash = SHA256d(preimage || nonce)
valid = (hash[0..3] == 0x00000000) AND (hash[4..11] < target)
```

---

## 3. v2 dMint CBOR Metadata Format

### 3.1 Deploy Metadata (Reveal Transaction)

v2 dMint tokens include a `dmint` object in the CBOR payload:

```json
{
  "v": 2,
  "p": [1, 4],
  "name": "Mineable Token",
  "ticker": "MINE",
  "dmint": {
    "algo": 0,
    "maxHeight": 10000,
    "reward": 100,
    "premine": 0,
    "diff": 10,
    "daa": {
      "mode": 0,
      "params": {}
    }
  }
}
```

### 3.2 `dmint` Field Specification

| Field | CBOR Key | Type | Required | Description |
|-------|----------|------|----------|-------------|
| Algorithm | `algo` | uint | Yes | Algorithm ID (see 3.3) |
| Max Height | `maxHeight` | uint | Yes | Maximum mint count |
| Reward | `reward` | uint | Yes | Photons per mint |
| Premine | `premine` | uint | No | Creator premine amount (default 0) |
| Base Difficulty | `diff` | uint | Yes | Initial difficulty (target divisor) |
| DAA Config | `daa` | map | No | Dynamic difficulty adjustment (default: fixed) |

### 3.3 Algorithm IDs

| ID | Name | GPU Shader | On-Chain PoW | Status |
|----|------|-----------|-------------|--------|
| `0x00` | SHA256d | `sha256d.wgsl` | Yes (v1 contract) | Active |
| `0x01` | Blake3 | `blake3.wgsl` | No (v2 contract) | Phase 3 |
| `0x02` | KangarooTwelve | `k12.wgsl` | No (v2 contract) | Phase 3 |
| `0x03` | Argon2id-Light | `argon2light.wgsl` | No (v2 contract) | Phase 3 |
| `0x04` | RandomX-Light | CPU only | No (v2 contract) | Deferred |

### 3.4 DAA Mode IDs

| ID | Mode | Description | `params` Fields |
|----|------|-------------|-----------------|
| `0x00` | Fixed | Static difficulty | *(none)* |
| `0x01` | Epoch | Bitcoin-style periodic | `epochLength`, `maxAdjustment` |
| `0x02` | ASERT | Exponential moving average | `targetTime`, `halfLife` |
| `0x03` | LWMA | Linear weighted MA | `targetTime`, `windowSize` |
| `0x04` | Schedule | Predetermined curve | `schedule: [{h, d}, ...]` |

### 3.5 DAA `params` Field Specification

#### Fixed (mode 0x00)
No params. Target never changes.

#### Epoch (mode 0x01)
```json
{
  "mode": 1,
  "params": {
    "epochLength": 2016,
    "maxAdjustment": 4.0
  }
}
```
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `epochLength` | uint | 2016 | Mints per adjustment epoch |
| `maxAdjustment` | float | 4.0 | Max adjustment factor per epoch |

#### ASERT (mode 0x02) — Recommended Default
```json
{
  "mode": 2,
  "params": {
    "targetTime": 60,
    "halfLife": 3600
  }
}
```
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `targetTime` | uint | 60 | Target seconds between mints |
| `halfLife` | uint | 3600 | Half-life in seconds |

**ASERT Formula** (computed on-chain via OP_LSHIFT/OP_RSHIFT):
```
new_target = anchor_target * 2^((time_delta - ideal_time_delta) / halfLife)
```

#### LWMA (mode 0x03)
```json
{
  "mode": 3,
  "params": {
    "targetTime": 60,
    "windowSize": 45
  }
}
```
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `targetTime` | uint | 60 | Target seconds between mints |
| `windowSize` | uint | 45 | Number of recent mints to average |

#### Schedule (mode 0x04)
```json
{
  "mode": 4,
  "params": {
    "schedule": [
      { "h": 0, "d": 10 },
      { "h": 5000, "d": 100 },
      { "h": 8000, "d": 1000 }
    ]
  }
}
```
| Field | Type | Description |
|-------|------|-------------|
| `schedule` | array | Ordered list of `{h: height, d: difficulty}` breakpoints |

Difficulty interpolates linearly between breakpoints.

---

## 4. v2 Contract Variants (Fully On-Chain — Hard Fork)

> **Architecture change:** The Radiant V2 hard fork adds `OP_BLAKE3` (0xee) and
> `OP_K12` (0xef) opcodes plus enables `OP_LSHIFT`/`OP_RSHIFT`. This eliminates the
> need for indexer-based PoW validation. ALL algorithms are validated on-chain.

### 4.1 Decision Matrix

| Token Config | Contract Bytecode | PoW Opcode | DAA |
|-------------|-------------------|-----------|-----|
| v1 token (no `dmint` in CBOR) | v1 bytecode | OP_HASH256 | Fixed (on-chain) |
| v2 + algo=SHA256d + daa=fixed | v1 bytecode | OP_HASH256 | Fixed (on-chain) |
| v2 + algo=SHA256d + daa=dynamic | v2-sha256d bytecode | OP_HASH256 | On-chain DAA |
| v2 + algo=blake3 | v2-blake3 bytecode | **OP_BLAKE3** | On-chain DAA |
| v2 + algo=k12 | v2-k12 bytecode | **OP_K12** | On-chain DAA |

### 4.2 v2 Contract Output Script

```
┌─────────────────────── State Data ───────────────────────┐
│ <height:4B>                                              │
│ OP_PUSHINPUTREFSINGLETON(d8) <contractRef:36B>           │
│ OP_PUSHINPUTREF(d0) <tokenRef:36B>                       │
│ <maxHeight:minimal>                                      │
│ <reward:minimal>                                         │
│ <target:minimal>                                         │
│ <algoId:1B>       (0x00=sha256d, 0x01=blake3, 0x02=k12) │
│ <lastTime:4B>     (unix timestamp of last mint)          │
│ <targetTime:minimal> (target seconds between mints)      │
├─────────────────────── Separator ────────────────────────┤
│ OP_STATESEPARATOR(bd)                                    │
├─────────────────────── Bytecode ─────────────────────────┤
│ <v2_contract_bytecode> (validates algorithm-specific PoW │
│  + state transitions + on-chain DAA + token rewards)     │
└──────────────────────────────────────────────────────────┘
```

**Key differences from v1:**
- `algoId` byte identifies which hash opcode the bytecode uses
- `lastTime` (4B) stores the previous mint's timestamp for DAA
- `targetTime` stores the desired seconds between mints (DAA parameter)
- Contract bytecode uses the algorithm-specific opcode (OP_HASH256 / OP_BLAKE3 / OP_K12)
- Contract bytecode computes DAA target adjustment using OP_LSHIFT/OP_RSHIFT
- **ALL validation is on-chain — no indexer dependency**

### 4.3 v2 Contract Bytecode Requirements

The v2 contract bytecode MUST:
1. Validate PoW: `algorithm_hash(preimage + nonce) < target`
   - SHA256d: `OP_HASH256`, first 4 bytes zero, next 8 bytes < target
   - Blake3: `OP_BLAKE3`, full 32-byte hash < target (256-bit comparison)
   - K12: `OP_K12`, full 32-byte hash < target (256-bit comparison)
2. Verify `new_height = old_height + 1`
3. Verify contractRef singleton is preserved in output
4. Verify tokenRef output is created with correct reward
5. Verify output script matches input script (except mutable state fields)
6. Verify `height < maxHeight`
7. Compute DAA: read `OP_TXLOCKTIME`, compute `time_delta = now - lastTime`,
   adjust target using `OP_LSHIFT`/`OP_RSHIFT` (ASERT-lite) or `OP_MUL`/`OP_DIV` (linear)
8. Store updated target, timestamp in output state

### 4.4 On-Chain DAA (ASERT-lite)

The contract computes difficulty adjustment using integer arithmetic:

```
// Read time from spending transaction
current_time = OP_TXLOCKTIME

// Compute time delta
time_delta = current_time - lastTime

// ASERT-lite: discrete power-of-2 adjustment
// drift = (time_delta - targetTime) / halfLife  (integer division)
// if drift > 0: new_target = old_target OP_LSHIFT drift  (easier)
// if drift < 0: new_target = old_target OP_RSHIFT (-drift)  (harder)
// if drift == 0: new_target = old_target  (unchanged)

// Clamp: max shift of ±4 per mint to prevent extreme swings
// Clamp: target must stay within [MIN_TARGET, MAX_TARGET]
```

**Fallback (Linear DAA)** — simpler, uses only OP_MUL/OP_DIV:
```
new_target = old_target * time_delta / targetTime
// Clamp to [MIN_TARGET, MAX_TARGET]
```

### 4.5 Security Properties

| Property | v1 Contract | v2 Contract |
|----------|------------|------------|
| PoW validated on-chain | ✅ SHA256d | ✅ SHA256d/Blake3/K12 |
| Griefing prevention | ✅ PoW required | ✅ PoW required |
| Trustless verification | ✅ | ✅ |
| SPV-provable mints | ✅ | ✅ |
| DAA manipulation | N/A (fixed) | Bounded by clamp (±4 shift/mint) |
| Timestamp gaming | N/A | ≤2hr window (consensus bounded) |

---

## 5. Indexer Role (Simplified — Analytics Only)

> **Key change:** With fully on-chain PoW and DAA, the indexer (RXinDexer) no longer
> validates PoW or computes DAA targets. It becomes a **convenience/analytics layer**.
> All trust-critical validation happens in consensus.

### 5.1 What the Indexer Does NOT Do Anymore

- ~~Validate PoW hashes for non-SHA256d algorithms~~ → On-chain via OP_BLAKE3/OP_K12
- ~~Compute DAA targets~~ → On-chain via OP_LSHIFT/OP_RSHIFT + OP_MUL/OP_DIV
- ~~Reject invalid mints~~ → Consensus rejects them (invalid script)

### 5.2 What the Indexer Still Does

1. **Token discovery**: Detect new dMint contracts and index metadata
2. **State tracking**: Read current height, target, reward from on-chain UTXOs
3. **Analytics**: Mint history, hashrate estimation, profitability ranking
4. **API for miners**: Provide contract list and current state (convenience — miner
   could also read on-chain directly, but API is faster)

### 5.3 Indexer API Endpoints (Unchanged)

```
GET /dmint/contracts                     — List mineable contracts
GET /dmint/contract/:ref                 — Contract details + current on-chain state
GET /dmint/contract/:ref/history         — Mint history for analytics
```

**Contract details response:**
```json
{
  "ref": "abc123...00000000",
  "version": 2,
  "algorithm": "blake3",
  "algorithm_id": 1,
  "daa": "asert-lite",
  "height": 5000,
  "max_height": 10000,
  "reward": 100,
  "current_target": "0000000003a2f8c1...",
  "last_mint_time": 1707500000,
  "target_time": 60,
  "estimated_hashrate": "1.2 GH/s"
}
```

**Note:** All values in this response are read directly from the on-chain UTXO state.
The indexer adds only derived analytics (hashrate estimate, profitability score).

---

## 6. Miner Integration

### 6.1 Algorithm Selection Flow

```
1. Fetch contract UTXO (on-chain state)
2. Parse state data: height, target, algoId, lastTime, targetTime
3. Read CBOR metadata from reveal tx for display info (name, ticker)
4. Determine algorithm from algoId in state data:
   a. 0x00 → sha256d (v1 compatible)
   b. 0x01 → blake3
   c. 0x02 → k12
5. Target is read directly from on-chain state (no indexer needed)
6. Load appropriate GPU shader
7. Configure buffer layout per algorithm
8. Start mining loop
```

### 6.2 Buffer Layouts Per Algorithm

#### SHA256d (algo 0x00) — v1 compatible
```
Binding 0: midstate    — 32 bytes (8 × u32), SHA256 partial hash
Binding 1: nonce       — 8 bytes (2 × u32), [nonce1, nonce2]
Binding 2: results     — 4 bytes (1 × u32), found nonce2
```

#### Blake3 (algo 0x01)
```
Binding 0: midstate    — 64 bytes (16 × u32), blake3 state after first block
Binding 1: nonce       — 8 bytes (2 × u32), [nonce1, nonce2]
Binding 2: target      — 32 bytes (8 × u32), full target for comparison
Binding 3: results     — 4 bytes (1 × u32), found nonce2
```

#### KangarooTwelve (algo 0x02)
```
Binding 0: midstate    — 200 bytes (50 × u32), keccak state
Binding 1: nonce       — 8 bytes (2 × u32), [nonce1, nonce2]
Binding 2: target      — 32 bytes (8 × u32), full target
Binding 3: results     — 4 bytes (1 × u32), found nonce2
```

#### Argon2id-Light (algo 0x03) — DEFERRED (no on-chain opcode yet)
```
Binding 0: midstate    — 64 bytes (16 × u32), preimage data
Binding 1: nonce       — 8 bytes (2 × u32), [nonce1, nonce2]
Binding 2: target      — 32 bytes (8 × u32), full target
Binding 3: memory      — 64 MB, argon2 memory blocks
Binding 4: results     — 4 bytes (1 × u32), found nonce2
```
> Argon2id-Light is deferred pending further analysis of memory-hardness DoS risks
> for an on-chain opcode. May be added in a future hard fork.

### 6.3 CPU Verification Per Algorithm

```typescript
function verify(algorithm: AlgorithmId, target: bigint, 
                preimage: Uint8Array, nonce: string): boolean {
  const fullPreimage = concat(preimage, hexToBytes(nonce)); // 72 bytes
  
  let hash: Uint8Array;
  switch (algorithm) {
    case 'sha256d':
      hash = sha256(sha256(fullPreimage));
      // First 4 bytes must be zero
      if (hash[0] || hash[1] || hash[2] || hash[3]) return false;
      // Next 8 bytes < target
      return readBigUint64BE(hash, 4) < target;
      
    case 'blake3':
      hash = blake3(fullPreimage, { dkLen: 32 });
      return readBigUint256BE(hash) < target;
      
    case 'k12':
      hash = k12(fullPreimage, { dkLen: 32 });
      return readBigUint256BE(hash) < target;
      
    // case 'argon2light': DEFERRED — no on-chain opcode yet
    //   hash = argon2id(fullPreimage, salt, { t: 3, m: 64, p: 1, dkLen: 32 });
    //   return readBigUint256BE(hash) < target;
  }
}
```

**Note:** SHA256d uses the v1 target format (4-byte-zero prefix + 8-byte comparison).
Other algorithms use full 32-byte hash comparison against a 256-bit target.

### 6.4 Target Format Differences

| Algorithm | Target Format | Comparison |
|-----------|--------------|------------|
| SHA256d | 64-bit (with implicit 32-bit zero prefix) | `hash[4..12] < target` |
| Blake3 | 256-bit | `hash[0..32] < target` |
| K12 | 256-bit | `hash[0..32] < target` |
| Argon2id-Light | 256-bit | `hash[0..32] < target` | *(deferred)* |

For v2 algorithms, the target is a full 256-bit value stored as 8 × u32 (big-endian).
Conversion between difficulty and 256-bit target:

```
target_256 = MAX_TARGET_256 / difficulty
MAX_TARGET_256 = 2^256 - 1
```

For SHA256d (v1 compatible), the target is stored as a 64-bit value with implicit
first-4-bytes-zero check:

```
target_64 = MAX_TARGET_64 / difficulty
MAX_TARGET_64 = 0x7FFFFFFFFFFFFFFF
valid = (hash[0..4] == 0) AND (hash[4..12] < target_64)
```

---

## 7. Deployment Flow

### 7.1 Deploying a v2 dMint Token

```
1. Creator builds CBOR metadata with dmint field
2. Creator chooses algorithm and DAA mode
3. System selects contract bytecode per algorithm:
   - algo=SHA256d + fixed DAA → v1 contract bytecode (backward compatible)
   - algo=SHA256d + dynamic DAA → v2-sha256d bytecode (OP_HASH256 + DAA)
   - algo=blake3 → v2-blake3 bytecode (OP_BLAKE3 + DAA)
   - algo=k12 → v2-k12 bytecode (OP_K12 + DAA)
4. Commit transaction created (hash of CBOR)
5. Reveal transaction created:
   - Input: spends commit output
   - ScriptSig: gly magic + CBOR payload
   - Output 0: dMint contract (state + bytecode) with initial target, lastTime=0
   - Output 1: token ref
6. Contract is live — miners read state directly from UTXO
7. Indexer detects and indexes for discovery/analytics (optional)
8. All PoW and DAA validation happens on-chain at consensus level
```

### 7.2 Example: Deploy Blake3 Token with ASERT DAA

```json
{
  "v": 2,
  "p": [1, 4],
  "name": "Fast Token",
  "ticker": "FAST",
  "dmint": {
    "algo": 1,
    "maxHeight": 100000,
    "reward": 50,
    "premine": 0,
    "diff": 100,
    "daa": {
      "mode": 2,
      "params": {
        "targetTime": 60,
        "halfLife": 3600
      }
    }
  }
}
```

On-chain state data:
```
<00000000>                              // height = 0
d8<contractRef:36B>                     // singleton
d0<tokenRef:36B>                        // token ref
<pushMinimal(100000)>                   // maxHeight
<pushMinimal(50)>                       // reward
<pushMinimal(target_from_diff_100)>     // initial target
<01>                                    // algoId = blake3
bd                                      // OP_STATESEPARATOR
<v2_contract_bytecode>                  // state-only validation
```

---

## 8. Migration and Compatibility

### 8.1 v1 Token Compatibility

| Aspect | Behavior |
|--------|----------|
| Existing v1 tokens | Continue working unchanged |
| v1 miner on v1 token | Works (SHA256d, fixed target) |
| v2 miner on v1 token | Works (detects no `dmint`, uses SHA256d) |
| v1 miner on v2 SHA256d token | Works (same contract bytecode) |
| v1 miner on v2 blake3 token | **Fails** (different algorithm) |

### 8.2 Indexer Compatibility

| Indexer Version | v1 Tokens | v2 SHA256d Tokens | v2 Other Tokens |
|----------------|-----------|-------------------|-----------------|
| v1 indexer | Full support | Partial (no DAA) | Not supported |
| v2 indexer | Full support | Full support | Full support |

### 8.3 Wallet Compatibility

| Wallet | Behavior |
|--------|----------|
| v1 wallet (Photonic) | Displays v2 dMint tokens as basic FT |
| v2 wallet | Full v2 dMint support with algorithm display |

---

## 9. Security Analysis

### 9.1 Threat Model

| Threat | v1 Contract | v2 Contract | Mitigation |
|--------|------------|------------|------------|
| Invalid PoW submission | Rejected by script | **Rejected by script** | On-chain OP_BLAKE3/OP_K12 |
| State griefing | Prevented by PoW | **Prevented by PoW** | All algorithms validated on-chain |
| DAA manipulation | N/A (fixed) | Bounded timestamps | Clamp ±4 shift/mint, consensus MTP |
| Algorithm downgrade | N/A | Bytecode is immutable | Contract locks to specific OP_* |
| Nonce reuse | Rejected (diff UTXO) | Rejected (diff UTXO) | Unique preimage per state |
| Integer overflow in DAA | N/A | Possible | 64-bit safeMul checks, clamp values |
| DAA formula bug | N/A | **Immutable once deployed** | Extensive testing before mainnet |

### 9.2 Recommendations

1. **All algorithms now have on-chain PoW** — no trust trade-off between algorithms
2. **DAA mode**: ASERT-lite recommended; clamp shift to ±4 per mint
3. **Minimum difficulty**: Follow recommended minimums per algorithm (see whitepaper §11.6)
4. **Test DAA extensively**: On-chain DAA formulas cannot be patched after deployment
5. **Timestamp bounds**: Contract should enforce `lastTime < current_time < lastTime + MAX_DELTA`

---

## 10. Implementation Phases

> **Full plan:** See [Radiant V2 Hard Fork Upgrade Plan](../../../Desktop/Misc%20Ecosystem%20Documents/Radiant_V2_Hard_Fork_Upgrade_Plan.md)

### Phase 2 (Design — Complete)
- [x] Define v2 CBOR metadata format
- [x] Define on-chain contract variants (fully on-chain with new opcodes)
- [x] Define miner buffer layouts per algorithm
- [x] Define target format differences
- [x] Update `types.ts` with DAA types
- [x] Create hard fork upgrade plan document

### Hard Fork (Radiant Core)
- [ ] Implement OP_BLAKE3 in Radiant Core (crypto + opcode + tests)
- [ ] Implement OP_K12 in Radiant Core (leverage Keccak + tests)
- [ ] Enable OP_LSHIFT/OP_RSHIFT (flip disabled flag + tests)
- [ ] Activation height gating + functional tests

### Phase 3 (Miner)
- [ ] Implement blake3 GPU shader (`blake3.wgsl`)
- [ ] Implement k12 GPU shader (`k12.wgsl`)
- [ ] Multi-algorithm miner loop in `miner.ts`
- [ ] On-chain target reading (no indexer dependency)
- [ ] CPU verification for blake3 and k12

### Ecosystem Upgrades
- [ ] radiantblockchain-constants: add OP_BLAKE3, OP_K12
- [ ] radiantjs: new opcodes in interpreter
- [ ] RadiantScript: blake3(), k12() global functions
- [ ] rxdeb: mirror Core opcode changes
- [ ] RXinDexer: v2 dMint detection + analytics (simplified)
- [ ] Photonic Wallet: v2 contract bytecodes + deployment UI
- [ ] Write v2 contract bytecodes per algorithm

### Integration Testing
- [ ] End-to-end: deploy + mine v2 Blake3 token on testnet
- [ ] End-to-end: deploy + mine v2 K12 token on testnet
- [ ] Backward compatibility: v1 tokens unchanged after fork
- [ ] Cross-tool consistency: radiantjs matches Core for new opcodes

---

## Appendix A: CBOR Encoding Example

A v2 dMint token with blake3 + ASERT DAA, CBOR-encoded:

```
Key-sorted CBOR map:
{
  "daa":       {"mode": 2, "params": {"halfLife": 3600, "targetTime": 60}},
  "diff":      100,
  "dmint":     ... (nested in root),
  "maxHeight": 100000,
  "name":      "Fast Token",
  "p":         [1, 4],
  "premine":   0,
  "reward":    50,
  "ticker":    "FAST",
  "v":         2
}
```

Note: The `dmint` object is a top-level field in the CBOR payload, containing
`algo`, `maxHeight`, `reward`, `premine`, `diff`, and `daa` as sub-fields.

## Appendix B: Algorithm Preimage Formats

All algorithms use the same 64-byte preimage structure from v1:

```
preimage[0..31]  = SHA256(txid || contractRef)        // 32 bytes
preimage[32..63] = SHA256(SHA256d(inputScript) ||     // 32 bytes
                          SHA256d(outputScript))
```

The midstate optimization differs per algorithm:

| Algorithm | Midstate | Size | Description |
|-----------|----------|------|-------------|
| SHA256d | SHA256 partial hash | 32B | After hashing first 512-bit block |
| Blake3 | First block state | 64B | Blake3 state after absorbing preimage |
| K12 | Keccak state | 200B | Keccak-p state after absorbing preimage |
| Argon2id-Light | Raw preimage | 64B | No midstate; full preimage passed |

## Appendix C: Difficulty ↔ Target Conversion

### SHA256d (v1 format)
```
MAX_TARGET = 0x7FFFFFFFFFFFFFFF (63-bit)
target = MAX_TARGET / difficulty
valid = (first_4_bytes == 0) AND (next_8_bytes < target)
```

### v2 Algorithms (256-bit format)
```
MAX_TARGET = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
target = MAX_TARGET / difficulty
valid = (full_32_byte_hash < target)
```

### Conversion between formats
```
difficulty_v1 = MAX_TARGET_64 / target_64
difficulty_v2 = MAX_TARGET_256 / target_256

# Same difficulty value means same expected hash count:
# E[hashes] = 2^32 * (MAX_TARGET_64 / target_64)  for SHA256d
# E[hashes] = MAX_TARGET_256 / target_256           for v2 algos
```
