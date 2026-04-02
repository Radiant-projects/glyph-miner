# CLI Mining Guide

This guide covers advanced usage of the Glyph Miner CLI for power users and server deployment.

## Installation

```bash
# Clone the repository
git clone https://github.com/radiantblockchain/glyph-miner.git
cd glyph-miner

# Install dependencies
pnpm install

# Build for production
pnpm build
```

## Basic Usage

### List Available Algorithms

```bash
npm run cli -- --list-algorithms
```

Output:
```
Available Mining Algorithms:

SHA256D
  Status: Supported
  Min Difficulty: 500000
  Memory Required: 512 bytes

BLAKE3
  Status: Supported
  Min Difficulty: 2500000
  Memory Required: 512 bytes

K12
  Status: Supported
  Min Difficulty: 50000
  Memory Required: 256 bytes

ARGON2LIGHT
  Status: Supported
  Min Difficulty: 10000
  Memory Required: 1048576 bytes
```

### Start Mining

```bash
# Basic mining with Blake3
npm run cli -- -a blake3 -w rdx:xxxxxxxx -d 10000

# Mining with specific DAA mode
npm run cli -- -a argon2light -w rdx:xxxxxxxx --daa-mode asert --target-time 60

# Multi-threaded mining
npm run cli -- -a k12 -w rdx:xxxxxxxx -t 8

# Mining with memory limits (for Argon2id-Light)
npm run cli -- -a argon2light -w rdx:xxxxxxxx --max-memory 256
```

## Command Line Options

### Required Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--wallet` | `-w` | Your wallet address for rewards | `-w rdx:xxxxxxxx` |

### Algorithm Options

| Option | Short | Description | Default | Example |
|--------|-------|-------------|---------|---------|
| `--algorithm` | `-a` | Mining algorithm | `blake3` | `-a sha256d` |
| `--difficulty` | `-d` | Initial difficulty | `10000` | `-d 50000` |

### DAA Options

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `--daa-mode` | Difficulty adjustment mode | `asert` | `--daa-mode lwma` |
| `--target-time` | Target block time (seconds) | `60` | `--target-time 120` |

### Performance Options

| Option | Short | Description | Default | Example |
|--------|-------|-------------|---------|---------|
| `--threads` | `-t` | Number of mining threads | `4` | `-t 16` |
| `--max-memory` | Maximum GPU memory (MB) | Auto | `--max-memory 512` |

### Pool Mining (Coming Soon)

| Option | Description | Example |
|--------|-------------|---------|
| `--pool` | Mining pool URL | `--pool stratum+tcp://pool.example.com:3333` |
| `--pool-user` | Pool username | `--pool-user worker1` |

### Utility Options

| Option | Description | Example |
|--------|-------------|---------|
| `--list-algorithms` | Show available algorithms | `--list-algorithms` |
| `--benchmark` | Run performance benchmark | `--benchmark` |
| `--verbose` | Verbose output | `--verbose` |

## Algorithm-Specific Configuration

### SHA256d (Legacy)
```bash
npm run cli -- -a sha256d -w rdx:xxxxxxxx -d 500000
```
- Compatible with legacy contracts
- Lower hashrate on modern GPUs
- 1KB memory usage

### Blake3 (Recommended)
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx -d 2500000
```
- Highest GPU performance
- Modern, secure algorithm
- 1KB memory usage

### KangarooTwelve
```bash
npm run cli -- -a k12 -w rdx:xxxxxxxx -d 50000
```
- Good CPU/GPU balance
- Keccak-based algorithm
- 256B memory usage

### Argon2id-Light (Memory-Hard)
```bash
npm run cli -- -a argon2light -w rdx:xxxxxxxx -d 10000 --max-memory 256
```
- Levels playing field between GPUs
- 64-512MB memory usage
- Automatically optimizes for available GPU memory

### RandomX-Light (CPU Only)
```bash
npm run cli -- -a randomx-light -w rdx:xxxxxxxx -d 25000 -t 8
```
- CPU-optimized algorithm
- 256KB memory usage
- Use all available CPU threads

## DAA Configuration

### Fixed Difficulty
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode fixed -d 10000
```

### ASERT (Recommended)
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode asert --target-time 60
```

### LWMA
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode lwma --target-time 120
```

### Epoch-Based
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode epoch --target-time 300
```

### Schedule
```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --daa-mode schedule
```

## Performance Optimization

### GPU Mining

For maximum GPU performance:

```bash
# Use Blake3 for highest hashrate
npm run cli -- -a blake3 -w rdx:xxxxxxxx -t 4

# For memory-hard leveling, use Argon2id-Light
npm run cli -- -a argon2light -w rdx:xxxxxxxx --max-memory 512

# Monitor GPU memory usage
npm run cli -- -a argon2light -w rdx:xxxxxxxx --verbose
```

### CPU Mining

For CPU-only mining:

```bash
# Use RandomX-Light with all threads
npm run cli -- -a randomx-light -w rdx:xxxxxxxx -t $(nproc)

# For mixed CPU/GPU, use KangarooTwelve
npm run cli -- -a k12 -w rdx:xxxxxxxx -t $(nproc)
```

### Server Deployment

Create a systemd service for continuous mining:

```ini
# /etc/systemd/system/glyph-miner.service
[Unit]
Description=Glyph Miner CLI
After=network.target

[Service]
User=miner
WorkingDirectory=/opt/glyph-miner
ExecStart=/usr/bin/npm run cli -- -a blake3 -w rdx:xxxxxxxx -t 8
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable glyph-miner
sudo systemctl start glyph-miner

# Check status
sudo systemctl status glyph-miner
sudo journalctl -u glyph-miner -f
```

## Monitoring

### Real-time Statistics

The CLI provides real-time mining statistics:

```
Glyph Mining Configuration:
Algorithm: BLAKE3
Difficulty: 10000
DAA Mode: ASERT
Target Block Time: 60s
Threads: 8
Wallet: rdx:xxxxxxxx

Starting mining...

Mining... Hashes: 1,234,567 | Rate: 2,345,678 H/s | Time: 525.3s
```

### Log Files

Enable verbose logging for detailed monitoring:

```bash
npm run cli -- -a blake3 -w rdx:xxxxxxxx --verbose > mining.log 2>&1 &
```

### Performance Metrics

Run benchmarks to test your hardware:

```bash
npm run cli -- --benchmark
```

## Troubleshooting

### Common Issues

**"GPU memory insufficient for Argon2id-Light"**
```bash
# Reduce memory usage
npm run cli -- -a argon2light -w rdx:xxxxxxxx --max-memory 128

# Or use a different algorithm
npm run cli -- -a blake3 -w rdx:xxxxxxxx
```

**"Algorithm not supported"**
```bash
# Check available algorithms
npm run cli -- --list-algorithms

# Update to latest version
git pull && pnpm install && pnpm build
```

**"WebGPU not available"**
- Use CLI instead of browser mining
- Update GPU drivers
- Try different algorithm

### Performance Issues

**Low hashrate:**
- Check GPU temperature and throttling
- Try different algorithms
- Increase thread count for CPU mining
- Update drivers

**High memory usage:**
- Reduce `--max-memory` for Argon2id-Light
- Use Blake3 or K12 instead
- Monitor system resources

## Advanced Usage

### Scripted Mining

Create mining scripts for automation:

```bash
#!/bin/bash
# mine.sh

WALLET="rdx:xxxxxxxx"
ALGORITHM="blake3"
DIFFICULTY="10000"
THREADS=$(nproc)

npm run cli -- -a $ALGORITHM -w $WALLET -d $DIFFICULTY -t $THREADS
```

### Configuration Files

Use environment variables for configuration:

```bash
# .env
GLYPH_WALLET=rdx:xxxxxxxx
GLYPH_ALGORITHM=blake3
GLYPH_DIFFICULTY=10000
GLYPH_THREADS=8
GLYPH_DAA_MODE=asert
```

```bash
# Load configuration and mine
source .env
npm run cli -- -a $GLYPH_ALGORITHM -w $GLYPH_WALLET -d $GLYPH_DIFFICULTY -t $GLYPH_THREADS --daa-mode $GLYPH_DAA_MODE
```

## Support

For additional help:
- Check the [troubleshooting guide](TROUBLESHOOTING.md)
- Review [algorithm specifications](ALGORITHMS.md)
- Join the community Discord
- Open an issue on GitHub
