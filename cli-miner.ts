#!/usr/bin/env node

/**
 * Glyph Miner CLI - Command Line Interface for Glyph Mining
 * Supports multiple algorithms and dynamic difficulty adjustment
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { program } from 'commander';
import { getAlgorithmConfig, isAlgorithmSupported } from './src/algorithms';
import { createDAAManager, getDefaultDAAParams } from './src/daa';
import { getGPUMemoryInfo, checkMemoryCompatibility, optimizeMemoryParameters } from './src/gpu-memory';
import { RECOMMENDED_MIN_DIFFICULTY } from './src/algorithms/types';

// Mining configuration
class MiningConfig {
  constructor(
    public algorithm: string,
    public difficulty: number,
    public daaMode: string,
    public targetBlockTime: number,
    public threads: number,
    public walletAddress: string,
    public contractId?: string,
    public poolUrl?: string,
    public poolUser?: string,
    public maxMemoryMB?: number
  ) {}
}

// CLI Options
interface CLIOptions {
  algorithm: string;
  difficulty: number;
  daaMode: string;
  targetBlockTime: number;
  threads: number;
  wallet: string;
  contract: string;
  pool: string;
  poolUser: string;
  maxMemory: number;
  listAlgorithms: boolean;
  benchmark: boolean;
  verbose: boolean;
}

// Main CLI program
program
  .name('glyph-miner-cli')
  .description('Glyph Mining CLI - Multi-algorithm cryptocurrency miner')
  .version('1.0.0');

program
  .option('-a, --algorithm <algo>', 'Mining algorithm (sha256d, blake3, k12, argon2light)', 'blake3')
  .option('-d, --difficulty <num>', 'Initial difficulty', '10000')
  .option('--daa-mode <mode>', 'Difficulty adjustment mode (fixed, epoch, asert, lwma, schedule)', 'asert')
  .option('--target-time <seconds>', 'Target block time in seconds', '60')
  .option('-t, --threads <num>', 'Number of mining threads', '4')
  .option('-w, --wallet <address>', 'Wallet address for rewards')
  .option('-c, --contract <id>', 'Contract ID to mine')
  .option('--pool <url>', 'Mining pool URL')
  .option('--pool-user <user>', 'Mining pool username')
  .option('--max-memory <mb>', 'Maximum GPU memory to use (MB)')
  .option('--list-algorithms', 'List available algorithms')
  .option('--benchmark', 'Run performance benchmark')
  .option('-v, --verbose', 'Verbose output')
  .parse();

const options = program.opts() as CLIOptions;

// List available algorithms
if (options.listAlgorithms) {
  console.log(chalk.blue('Available Mining Algorithms:'));
  console.log('');
  
  const algorithms = ['sha256d', 'blake3', 'k12', 'argon2light'];
  
  algorithms.forEach(algo => {
    const config = getAlgorithmConfig(algo as any);
    const supported = isAlgorithmSupported(algo as any);
    const minDiff = RECOMMENDED_MIN_DIFFICULTY[algo as any] || 10000;
    
    console.log(`${chalk.green(algo.toUpperCase())}`);
    console.log(`  Status: ${supported ? chalk.green('Supported') : chalk.red('Not Supported')}`);
    console.log(`  Min Difficulty: ${minDiff}`);
    console.log(`  Memory Required: ${config?.bufferRequirements.midstate * 4} bytes`);
    console.log('');
  });
  
  process.exit(0);
}

// Run benchmark
if (options.benchmark) {
  console.log(chalk.blue('Running Performance Benchmark...'));
  console.log('');
  
  // This would run actual benchmarking tests
  console.log('Benchmark feature coming soon!');
  console.log('Will test all algorithms and provide performance metrics.');
  
  process.exit(0);
}

// Validate required options
if (!options.wallet) {
  console.error(chalk.red('Error: Wallet address is required'));
  console.log('Use -w or --wallet to specify your wallet address');
  process.exit(1);
}

// Create mining configuration
const config = new MiningConfig(
  options.algorithm,
  options.difficulty,
  options.daaMode,
  options.targetBlockTime,
  options.threads,
  options.wallet,
  options.contract,
  options.pool,
  options.poolUser,
  options.maxMemory
);

// Validate algorithm
if (!isAlgorithmSupported(config.algorithm as any)) {
  console.error(chalk.red(`Error: Algorithm '${config.algorithm}' is not supported`));
  console.log('Use --list-algorithms to see available options');
  process.exit(1);
}

// Check algorithm compatibility
const algoConfig = getAlgorithmConfig(config.algorithm as any);
if (!algoConfig) {
  console.error(chalk.red('Error: Failed to load algorithm configuration'));
  process.exit(1);
}

// Memory-intensive algorithm checks
if (config.algorithm === 'argon2light') {
  console.log(chalk.yellow('Argon2id-Light requires significant GPU memory'));
  
  // Simulate GPU memory check (would use actual GPU in real implementation)
  const mockGPUInfo = {
    totalMemoryMB: 8192, // 8GB
    availableMemoryMB: 5734, // ~70% available
    vendor: 'NVIDIA',
    model: 'RTX 3060',
    isIntegrated: false,
    maxTextureSize: 16384,
    maxStorageBufferBindingSize: 134217728, // 128MB
  };
  
  const memoryReq = {
    minMemoryMB: 64,
    recommendedMemoryMB: 256,
    maxMemoryMB: 512,
    memoryBlocks: 1024,
    blockSizeBytes: 1024,
  };
  
  const memoryCheck = checkMemoryCompatibility(mockGPUInfo, memoryReq);
  
  if (!memoryCheck.compatible) {
    console.error(chalk.red('Error: GPU memory insufficient for Argon2id-Light'));
    memoryCheck.errors.forEach(error => console.error(chalk.red(`  ${error}`)));
    process.exit(1);
  }
  
  if (!memoryCheck.recommended) {
    console.log(chalk.yellow('Warning: GPU memory below recommended'));
    memoryCheck.warnings.forEach(warning => console.log(chalk.yellow(`  ${warning}`)));
  }
  
  // Optimize memory parameters
  const optimized = optimizeMemoryParameters(mockGPUInfo, config.algorithm);
  if (optimized.warnings.length > 0) {
    console.log(chalk.yellow('Memory optimization:'));
    optimized.warnings.forEach(warning => console.log(chalk.yellow(`  ${warning}`)));
  }
}

// Setup DAA
const daaParams = getDefaultDAAParams(config.daaMode as any);
if (config.targetBlockTime) {
  daaParams.targetBlockTime = config.targetBlockTime;
}

const daaManager = createDAAManager(
  config.daaMode as any,
  daaParams,
  BigInt(config.difficulty),
  0,
  Date.now()
);

// Display configuration
console.log(chalk.blue('Glyph Mining Configuration:'));
console.log('');
console.log(`Algorithm: ${chalk.green(config.algorithm.toUpperCase())}`);
console.log(`Difficulty: ${chalk.yellow(config.difficulty)}`);
console.log(`DAA Mode: ${chalk.cyan(config.daaMode)}`);
console.log(`Target Block Time: ${chalk.cyan(config.targetBlockTime)}s`);
console.log(`Threads: ${chalk.cyan(config.threads)}`);
console.log(`Wallet: ${chalk.green(config.walletAddress)}`);

if (config.contractId) {
  console.log(`Contract: ${chalk.green(config.contractId)}`);
}

if (config.poolUrl) {
  console.log(`Pool: ${chalk.green(config.poolUrl)}`);
  if (config.poolUser) {
    console.log(`Pool User: ${chalk.green(config.poolUser)}`);
  }
}

console.log('');

// Mining status
console.log(chalk.blue('Starting mining...'));
console.log('');

// Simulate mining (would connect to actual mining engine)
let hashes = 0;
let startTime = Date.now();
let found = false;

const miningLoop = setInterval(() => {
  hashes += config.threads * 1000; // Simulate 1000 hashes per thread
  
  const elapsed = (Date.now() - startTime) / 1000;
  const hashrate = Math.floor(hashes / elapsed);
  
  // Simulate finding a solution (very low probability)
  if (Math.random() < 0.0001) {
    found = true;
    const nonce = Math.floor(Math.random() * 0xffffffff).toString(16);
    
    console.log(chalk.green.bold('✓ SOLUTION FOUND!'));
    console.log(`Nonce: ${chalk.yellow(nonce)}`);
    console.log(`Algorithm: ${chalk.green(config.algorithm)}`);
    console.log(`Difficulty: ${chalk.yellow(config.difficulty)}`);
    console.log(`Mining Time: ${chalk.cyan(elapsed.toFixed(2))}s`);
    console.log(`Hashrate: ${chalk.cyan(hashrate.toLocaleString())} H/s`);
    
    clearInterval(miningLoop);
    process.exit(0);
  }
  
  // Update status every 5 seconds
  if (Math.floor(elapsed) % 5 === 0) {
    process.stdout.write(`\r${chalk.cyan('Mining...')} Hashes: ${hashes.toLocaleString()} | Rate: ${hashrate.toLocaleString()} H/s | Time: ${elapsed.toFixed(1)}s`);
  }
}, 100);

// Handle graceful shutdown
process.on('SIGINT', () => {
  clearInterval(miningLoop);
  console.log('\n');
  console.log(chalk.yellow('Mining stopped by user'));
  console.log(`Total hashes: ${hashes.toLocaleString()}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(miningLoop);
  console.log('\n');
  console.log(chalk.yellow('Mining terminated'));
  process.exit(0);
});
