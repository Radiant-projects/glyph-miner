# Glyph Miner

Glyph Miner is a multi-algorithm cryptocurrency miner for tokens that follow the Glyphs Protocol, using layer 1 mining contracts.

> **V2 Hard Fork (Radiant Core 2.1, Block 410,000):** After activation, Blake3 and KangarooTwelve dMint tokens are validated **entirely on-chain** via OP_BLAKE3 and OP_K12 consensus opcodes. No indexer trust required — all proof-of-work is verified at the script level.

## Mining Options

### 🌐 Browser Extension (Recommended for GPU Mining)
- **WebGPU Support**: Requires a browser with WebGPU capabilities (Chrome, Edge, Firefox with flags)
- **GPU Mining**: Optimized for modern GPUs with multiple algorithms
- **Easy Setup**: No installation required - just load the extension
- **Real-time Monitoring**: Live hashrate and mining statistics
- **Algorithm Support**: SHA256d, Blake3, KangarooTwelve, Argon2id-Light

### 💻 CLI Miner (Advanced Users)
- **Command Line Interface**: Full control over mining parameters
- **CPU Mining**: RandomX-Light algorithm for CPU optimization
- **Pool Mining**: Support for mining pools (coming soon)
- **Server Deployment**: Ideal for dedicated mining rigs
- **Scriptable**: Easy automation and monitoring

## Quick Start

### Browser Mining
1. Install the Glyph Miner browser extension
2. Connect your wallet (Photonic Wallet recommended)
3. Select your mining algorithm and difficulty
4. Start mining directly in your browser

### CLI Mining
```bash
# Install dependencies
pnpm install

# List available algorithms
npm run cli -- --list-algorithms

# Start mining with Blake3
npm run cli -- -a blake3 -w <your-wallet-address> -d 10000

# Run performance benchmark
npm run cli -- --benchmark
```

## Supported Algorithms

| Algorithm | Type | Recommended For | Memory Usage |
|-----------|------|-----------------|--------------|
| SHA256d | GPU | Legacy compatibility | ~1 KB |
| Blake3 | GPU | High performance mining | ~1 KB |
| KangarooTwelve | GPU | CPU/GPU balance | ~200 B |
| Argon2id-Light | GPU | Memory-hard leveling | 64-512 MB |
| RandomX-Light | CPU | CPU-only mining | 256 KB |

## Difficulty Adjustment

Glyph Miner supports multiple Dynamic Difficulty Adjustment (DAA) modes:

- **Fixed**: Static difficulty
- **Epoch**: Difficulty changes per epoch
- **ASERT**: Absolutely Scheduled Exponentially Rising Target
- **LWMA**: Linear Weighted Moving Average
- **Schedule**: Creator-defined difficulty schedule

## Requirements

### Browser Mining
- Modern browser with WebGPU support
- GPU with 4GB+ VRAM (for Argon2id-Light)
- Photonic Wallet or compatible wallet

### CLI Mining
- Node.js 18+
- 4GB+ RAM
- Multi-core CPU recommended

## Documentation

- [CLI Mining Guide](docs/CLI_MINING.md) - Detailed CLI usage
- [Algorithm Details](docs/ALGORITHMS.md) - Technical specifications
- [DAA Configuration](docs/DAA_GUIDE.md) - Difficulty adjustment setup
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues

## Roadmap

- [ ] Mining pool support
- [ ] Mobile app development
- [ ] Advanced monitoring dashboard
- [ ] Cross-platform CLI builds

## Development

### Install Dependencies

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

### Build for Production

```bash
pnpm build
```

Build will be in `dist`. App can be served as a static site.

### CLI Development

```bash
# Run CLI with TypeScript
npx ts-node cli-miner.ts --help

# Build CLI for production
npm run build
npm run cli -- --list-algorithms
```

## Protocol

Glyphs are encoded in an unlocking script, identified by the string "gly" followed by a CBOR encoded token payload:

```
OP_PUSH "gly"
OP_PUSH <CBOR Payload>
```

Example CBOR payload:

```
{
    p: [1, 4],
    name: "My token",
    ticker: "XYZ",
    main: {
        t: "image/jpeg",
        b: <bytes>
    }
}
```

The `p` property contains an array of protocols used by the token. Current protocol identifiers are as follows:

| ID | Protocol           |
|----|--------------------|
| 1  | Fungible token     |
| 2  | Non-Fungible token |
| 3  | Data storage       |
| 4  | Decentralized mint |
| 5  | Mutable            |

For a mineable token, a `p` value of `[1, 4]` must be used, indicating the token implements the FT and dmint contracts.

The mint transaction must contain outputs for standard FT and dmint contracts.

### PoW algorithm

Mineable Glyphs use the follow proof-of-work algorithm:

```
hash = sha256(sha256(
    sha256(currentLocationTxid + contractRef) +
    sha256(anyInputHash + anyOutputHash) +
    nonce
))
```

Resulting hash must be below the target.

`anyInputHash` and `anyOutputHash` must be the hash of any input or output in the transaction. This allows work to be bound to the miner's address and prevents nonces being stolen. This will typically be a pay-to-public-key-hash but any script can be used. The contract will verify these scripts exist.

### Parallel contracts

Multiple mining contracts can be created for token. This can be used to reduce congestion for low difficulty contracts.

### Contract

Dmint contract is compiled from RadiantScript. See [contract.rad](src/contract.rad).

## License

MIT. See [LICENSE](LICENSE).
