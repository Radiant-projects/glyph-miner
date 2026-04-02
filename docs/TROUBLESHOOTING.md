# Troubleshooting Guide

This guide covers common issues and solutions for Glyph Miner browser and CLI versions.

## Browser Mining Issues

### WebGPU Not Available

**Symptoms:**
- "WebGPU not supported" error
- Mining doesn't start
- GPU not detected

**Solutions:**
1. **Browser Compatibility:**
   - Use Chrome 113+ or Edge 113+
   - Enable WebGPU in Firefox: `about:config` → `dom.webgpu.enabled = true`
   - Update browser to latest version

2. **GPU Driver Updates:**
   ```bash
   # NVIDIA
   # Download latest drivers from NVIDIA website
   
   # AMD
   # Download latest drivers from AMD website
   
   # Intel
   # Update through Intel Driver & Support Assistant
   ```

3. **Hardware Check:**
   - Verify GPU supports WebGPU
   - Check GPU is not in power-saving mode
   - Ensure sufficient VRAM (4GB+ for Argon2id-Light)

### Low Hashrate

**Symptoms:**
- Hashrate much lower than expected
- Mining but very slow
- GPU utilization low

**Solutions:**
1. **Algorithm Selection:**
   ```bash
   # Try different algorithms
   Blake3: Highest performance
   K12: Balanced performance
   SHA256d: Legacy compatibility
   ```

2. **Browser Settings:**
   - Disable hardware acceleration: `chrome://settings/system`
   - Close other tabs/applications
   - Restart browser

3. **GPU Settings:**
   - Set power profile to "High Performance"
   - Disable GPU throttling
   - Check temperature limits

### Memory Issues with Argon2id-Light

**Symptoms:**
- "GPU memory insufficient" error
- Mining crashes
- System becomes unresponsive

**Solutions:**
1. **Reduce Memory Usage:**
   ```bash
   # CLI: Reduce memory limit
   npm run cli -- -a argon2light -w rdx:xxxxxxxx --max-memory 128
   
   # Browser: Use different algorithm
   Select Blake3 or K12 instead
   ```

2. **System Optimization:**
   - Close other applications
   - Increase virtual memory
   - Restart system

3. **GPU Memory Check:**
   ```bash
   # Check available GPU memory
   npm run cli -- -a argon2light -w rdx:xxxxxxxx --verbose
   ```

### Wallet Connection Issues

**Symptoms:**
- "Wallet not connected" error
- Cannot start mining
- Transaction failures

**Solutions:**
1. **Photonic Wallet:**
   - Ensure wallet is unlocked
   - Check network connection
   - Verify wallet address format

2. **Browser Extension:**
   - Enable extension permissions
   - Check extension is updated
   - Restart browser

3. **Network Issues:**
   - Check internet connection
   - Verify RPC endpoint
   - Try different network

## CLI Mining Issues

### Installation Problems

**Symptoms:**
- "Command not found" error
- Module not found errors
- Build failures

**Solutions:**
1. **Node.js Version:**
   ```bash
   # Check Node.js version (requires 18+)
   node --version
   
   # Update Node.js if needed
   nvm install 18
   nvm use 18
   ```

2. **Dependencies:**
   ```bash
   # Clean install
   rm -rf node_modules package-lock.json
   pnpm install
   
   # Rebuild
   pnpm build
   ```

3. **Permissions:**
   ```bash
   # Fix permissions
   chmod +x cli-miner.js
   sudo npm install -g
   ```

### Algorithm Not Supported

**Symptoms:**
- "Algorithm not supported" error
- List shows algorithm as unavailable
   ```bash
   npm run cli -- --list-algorithms
   ```

**Solutions:**
1. **Check Available Algorithms:**
   ```bash
   npm run cli -- --list-algorithms
   ```

2. **Update Software:**
   ```bash
   git pull origin main
   pnpm install
   pnpm build
   ```

3. **Use Supported Algorithm:**
   - SHA256d: Always available
   - Blake3: Recommended
   - K12: Good alternative

### Performance Issues

**Symptoms:**
- Very low hashrate
- High CPU usage
- System lag

**Solutions:**
1. **Thread Optimization:**
   ```bash
   # Use optimal thread count
   npm run cli -- -a blake3 -w rdx:xxxxxxxx -t $(nproc)
   
   # For GPU algorithms, use fewer threads
   npm run cli -- -a blake3 -w rdx:xxxxxxxx -t 4
   ```

2. **Algorithm Selection:**
   ```bash
   # CPU mining: Use RandomX-Light
   npm run cli -- -a randomx-light -w rdx:xxxxxxxx -t $(nproc)
   
   # GPU mining: Use Blake3
   npm run cli -- -a blake3 -w rdx:xxxxxxxx
   ```

3. **System Resources:**
   - Close other applications
   - Monitor CPU temperature
   - Check memory usage

### Memory Errors

**Symptoms:**
- "Out of memory" error
- Process killed
- System crashes

**Solutions:**
1. **Reduce Memory Usage:**
   ```bash
   # Argon2id-Light: Reduce memory
   npm run cli -- -a argon2light -w rdx:xxxxxxxx --max-memory 64
   
   # Use different algorithm
   npm run cli -- -a blake3 -w rdx:xxxxxxxx
   ```

2. **System Configuration:**
   ```bash
   # Increase swap space
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

3. **Process Limits:**
   ```bash
   # Check memory limits
   ulimit -v
   
   # Increase if needed
   ulimit -v unlimited
   ```

## Network Issues

### Connection Problems

**Symptoms:**
- "Connection failed" error
- Cannot submit work
   ```bash
   # Test network connectivity
   ping radiantblockchain.io
   curl -I https://api.radiantblockchain.io
   ```

**Solutions:**
1. **Network Configuration:**
   - Check firewall settings
   - Verify DNS resolution
   - Try different network

2. **RPC Issues:**
   - Check RPC endpoint status
   - Verify API key if required
   - Use backup endpoints

3. **Timeout Settings:**
   ```bash
   # Increase timeout (if supported)
   npm run cli -- -a blake3 -w rdx:xxxxxxxx --timeout 30000
   ```

### Pool Mining Issues

**Symptoms:**
- Cannot connect to pool
- Rejected shares
   ```bash
   # Test pool connection
   telnet pool.example.com 3333
   ```

**Solutions:**
1. **Pool Configuration:**
   - Verify pool URL and port
   - Check pool status page
   - Use correct worker format

2. **Authentication:**
   - Verify username/password
   - Check wallet address format
   - Use correct algorithm

3. **Share Rejection:**
   - Check difficulty settings
   - Verify algorithm compatibility
   - Update mining software

## Hardware Issues

### GPU Problems

**Symptoms:**
- GPU crashes
- Artifacts on screen
- Overheating

**Solutions:**
1. **Temperature Monitoring:**
   ```bash
   # NVIDIA
   nvidia-smi
   
   # AMD
   radeontop
   
   # Intel
   intel-gpu-tools
   ```

2. **Power Settings:**
   - Set power limit to maximum
   - Disable power saving
   - Check power supply

3. **Driver Issues:**
   - Update GPU drivers
   - Clean driver installation
   - Check for hardware conflicts

### CPU Problems

**Symptoms:**
- High CPU temperature
- System throttling
- Poor performance

**Solutions:**
1. **Temperature Control:**
   ```bash
   # Monitor CPU temperature
   sensors
   
   # Check thermal throttling
   cpupower frequency-info
   ```

2. **Power Management:**
   ```bash
   # Set performance governor
   sudo cpupower frequency-set -g performance
   
   # Disable CPU throttling
   sudo cpupower frequency-set -d 2GHz -u 4GHz
   ```

3. **Thread Optimization:**
   - Use optimal thread count
   - Avoid hyperthreading for some algorithms
   - Monitor CPU utilization

## Debugging Tools

### Verbose Logging

**CLI:**
```bash
# Enable verbose output
npm run cli -- -a blake3 -w rdx:xxxxxxxx --verbose

# Log to file
npm run cli -- -a blake3 -w rdx:xxxxxxxx --verbose > mining.log 2>&1
```

**Browser:**
- Open developer console (F12)
- Check console for errors
- Monitor network requests

### Performance Monitoring

**CLI:**
```bash
# Monitor system resources
htop
iotop
nvidia-smi -l 1

# Check mining performance
npm run cli -- -a blake3 -w rdx:xxxxxxxx --benchmark
```

**Browser:**
- Use browser task manager
- Monitor GPU usage
- Check memory consumption

### Network Debugging

```bash
# Test connectivity
ping radiantblockchain.io
traceroute radiantblockchain.io

# Check DNS
nslookup radiantblockchain.io
dig radiantblockchain.io

# Test API
curl -X GET https://api.radiantblockchain.io/status
```

## Common Error Messages

### "WebGPU not available"
- Update browser
- Check GPU drivers
- Try different browser

### "Insufficient GPU memory"
- Reduce memory usage
- Use different algorithm
- Close other applications

### "Algorithm not supported"
- Update software
- Check available algorithms
- Use supported algorithm

### "Connection failed"
- Check network
- Verify RPC endpoint
- Try different endpoint

### "Invalid wallet address"
- Check address format
- Verify address exists
- Use correct prefix

### "Difficulty too high"
- Lower difficulty
- Use different algorithm
- Check hashrate

## Performance Optimization

### Browser Optimization
1. **Settings:**
   - Disable unnecessary extensions
   - Enable hardware acceleration
   - Clear cache regularly

2. **Hardware:**
   - Use dedicated GPU
   - Ensure sufficient VRAM
   - Monitor temperature

3. **Software:**
   - Update browser
   - Use latest drivers
   - Close other tabs

### CLI Optimization
1. **System:**
   - Use optimal thread count
   - Monitor resources
   - Optimize power settings

2. **Algorithm:**
   - Choose appropriate algorithm
   - Tune parameters
   - Benchmark performance

3. **Network:**
   - Use low-latency connection
   - Choose nearby servers
   - Monitor latency

## Getting Help

### Community Support
- Discord: [Glyph Mining Discord](https://discord.gg/glyph)
- GitHub: [Issue Tracker](https://github.com/radiantblockchain/glyph-miner/issues)
- Documentation: [Full Docs](https://docs.glyph-miner.com)

### Bug Reports
When reporting bugs, include:
- Operating system and version
- Browser and version (for web mining)
- GPU/CPU specifications
- Error messages
- Steps to reproduce

### Feature Requests
- Submit via GitHub issues
- Include use case
- Provide implementation suggestions

## Preventive Maintenance

### Regular Updates
- Update mining software
- Keep drivers current
- Monitor security updates

### System Monitoring
- Check temperatures regularly
- Monitor performance metrics
- Review log files

### Backup Procedures
- Backup wallet files
- Save configuration
- Document settings
