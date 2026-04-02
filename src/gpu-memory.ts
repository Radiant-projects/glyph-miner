// GPU memory detection and management for memory-intensive algorithms

export interface GPUMemoryInfo {
  totalMemoryMB: number;
  availableMemoryMB: number;
  vendor: string;
  model: string;
  isIntegrated: boolean;
  maxTextureSize: number;
  maxStorageBufferBindingSize: number;
}

export interface MemoryRequirement {
  minMemoryMB: number;
  recommendedMemoryMB: number;
  maxMemoryMB: number;
  memoryBlocks: number;
  blockSizeBytes: number;
}

export interface MemoryCheckResult {
  compatible: boolean;
  recommended: boolean;
  warnings: string[];
  errors: string[];
  utilization: number; // Percentage of GPU memory that would be used
}

// Get GPU memory information
export async function getGPUMemoryInfo(adapter: GPUAdapter): Promise<GPUMemoryInfo> {
  // WebGPU doesn't expose detailed memory info, so we'll use adapter limits to estimate
  const limits = adapter.limits;
  
  // Get basic adapter info (limited in WebGPU)
  let vendor = 'Unknown';
  let model = 'Unknown';
  
  // Try to get some info from the adapter (WebGPU limitations)
  try {
    // @ts-ignore - requestAdapterInfo may not be available in all implementations
    if ('requestAdapterInfo' in adapter) {
      const info = (adapter as any).requestAdapterInfo();
      vendor = info.vendor || 'Unknown';
      model = info.architecture || 'Unknown';
    }
  } catch (e) {
    // Fallback to generic detection
    vendor = 'Unknown';
    model = 'Unknown';
  }
  
  // Estimate memory based on adapter limits
  const maxBufferSize = limits.maxStorageBufferBindingSize || 0;
  const maxTextureSize = limits.maxTextureDimension2D || 0;
  
  // Estimate total memory (this is approximate since WebGPU doesn't expose exact memory)
  let estimatedMemoryMB = 0;
  
  // Common GPU memory sizes based on vendor and model
  if (vendor.includes('NVIDIA')) {
    if (model.includes('RTX 4090')) estimatedMemoryMB = 24576; // 24GB
    else if (model.includes('RTX 4080')) estimatedMemoryMB = 16384; // 16GB
    else if (model.includes('RTX 4070')) estimatedMemoryMB = 12288; // 12GB
    else if (model.includes('RTX 3060')) estimatedMemoryMB = 12288; // 12GB
    else if (model.includes('RTX 3050')) estimatedMemoryMB = 8192;  // 8GB
    else estimatedMemoryMB = 8192; // Default estimate
  } else if (vendor.includes('AMD')) {
    if (model.includes('RX 7900')) estimatedMemoryMB = 24576; // 24GB
    else if (model.includes('RX 6800')) estimatedMemoryMB = 16384; // 16GB
    else if (model.includes('RX 6700')) estimatedMemoryMB = 12288; // 12GB
    else if (model.includes('RX 6600')) estimatedMemoryMB = 8192;  // 8GB
    else estimatedMemoryMB = 8192; // Default estimate
  } else if (vendor.includes('Intel')) {
    estimatedMemoryMB = 4096; // Integrated graphics typically have less
  } else {
    // Conservative estimate for unknown GPUs
    estimatedMemoryMB = Math.min(8192, maxBufferSize / (1024 * 1024));
  }
  
  // Check if it's integrated graphics
  const isIntegrated = vendor.includes('Intel') || model.includes('Integrated');
  
  // Estimate available memory (assume 70% available for mining)
  const availableMemoryMB = Math.floor(estimatedMemoryMB * 0.7);
  
  return {
    totalMemoryMB: estimatedMemoryMB,
    availableMemoryMB,
    vendor,
    model,
    isIntegrated,
    maxTextureSize,
    maxStorageBufferBindingSize: maxBufferSize,
  };
}

// Check if GPU can handle memory requirements
export function checkMemoryCompatibility(
  gpuInfo: GPUMemoryInfo,
  requirement: MemoryRequirement
): MemoryCheckResult {
  const result: MemoryCheckResult = {
    compatible: true,
    recommended: true,
    warnings: [],
    errors: [],
    utilization: 0,
  };
  
  // Check minimum memory requirement
  if (gpuInfo.availableMemoryMB < requirement.minMemoryMB) {
    result.compatible = false;
    result.recommended = false;
    result.errors.push(
      `Insufficient GPU memory. Required: ${requirement.minMemoryMB}MB, Available: ${gpuInfo.availableMemoryMB}MB`
    );
  }
  
  // Check recommended memory
  if (gpuInfo.availableMemoryMB < requirement.recommendedMemoryMB) {
    result.recommended = false;
    result.warnings.push(
      `GPU memory below recommended. Recommended: ${requirement.recommendedMemoryMB}MB, Available: ${gpuInfo.availableMemoryMB}MB`
    );
  }
  
  // Check for integrated graphics limitations
  if (gpuInfo.isIntegrated && requirement.minMemoryMB > 2048) {
    result.recommended = false;
    result.warnings.push(
      'Integrated graphics may have performance issues with memory-intensive algorithms'
    );
  }
  
  // Calculate memory utilization
  const requiredMemoryMB = requirement.memoryBlocks * requirement.blockSizeBytes / (1024 * 1024);
  result.utilization = (requiredMemoryMB / gpuInfo.totalMemoryMB) * 100;
  
  // Warn about high memory utilization
  if (result.utilization > 80) {
    result.warnings.push(
      `High memory utilization: ${result.utilization.toFixed(1)}%. This may impact system performance.`
    );
  }
  
  // Check storage buffer binding limits
  const requiredBufferSize = requirement.memoryBlocks * requirement.blockSizeBytes;
  if (requiredBufferSize > gpuInfo.maxStorageBufferBindingSize) {
    result.compatible = false;
    result.errors.push(
      `Storage buffer size exceeds GPU limits. Required: ${requiredBufferSize} bytes, Max: ${gpuInfo.maxStorageBufferBindingSize} bytes`
    );
  }
  
  return result;
}

// Get memory requirements for algorithms
export function getAlgorithmMemoryRequirements(algorithmId: string): MemoryRequirement {
  switch (algorithmId) {
    case 'argon2light':
      return {
        minMemoryMB: 64,
        recommendedMemoryMB: 256,
        maxMemoryMB: 512,
        memoryBlocks: 1024,
        blockSizeBytes: 1024, // 1KB per block
      };
    case 'sha256d':
    case 'blake3':
    case 'k12':
      return {
        minMemoryMB: 1,
        recommendedMemoryMB: 4,
        maxMemoryMB: 16,
        memoryBlocks: 256,
        blockSizeBytes: 64, // 64 bytes per block
      };
    default:
      return {
        minMemoryMB: 1,
        recommendedMemoryMB: 4,
        maxMemoryMB: 16,
        memoryBlocks: 256,
        blockSizeBytes: 64,
      };
  }
}

// Optimize memory parameters based on GPU capabilities
export function optimizeMemoryParameters(
  gpuInfo: GPUMemoryInfo,
  algorithmId: string
): {
  memoryBlocks: number;
  timeCost: number;
  parallelism: number;
  warnings: string[];
} {
  const baseRequirement = getAlgorithmMemoryRequirements(algorithmId);
  const warnings: string[] = [];
  
  let memoryBlocks = baseRequirement.memoryBlocks;
  let timeCost = 3; // Default for Argon2id-Light
  let parallelism = 4; // Default for Argon2id-Light
  
  // Adjust based on available memory
  if (algorithmId === 'argon2light') {
    const maxBlocks = Math.floor(gpuInfo.availableMemoryMB * 0.8); // Use 80% of available memory
    
    if (maxBlocks < baseRequirement.minMemoryMB) {
      // Not enough memory, reduce parameters
      memoryBlocks = 512; // Minimum viable
      timeCost = 2;
      parallelism = 2;
      warnings.push('Reduced Argon2id-Light parameters due to limited GPU memory');
    } else if (maxBlocks < baseRequirement.recommendedMemoryMB) {
      // Use reduced parameters
      memoryBlocks = maxBlocks;
      warnings.push(`Using reduced memory blocks: ${memoryBlocks} instead of recommended ${baseRequirement.memoryBlocks}`);
    } else {
      // Can use full or enhanced parameters
      memoryBlocks = Math.min(maxBlocks, 2048); // Cap at 2GB
      if (memoryBlocks > baseRequirement.memoryBlocks) {
        warnings.push(`Using enhanced memory blocks: ${memoryBlocks} for better performance`);
      }
    }
    
    // Adjust for integrated graphics
    if (gpuInfo.isIntegrated) {
      memoryBlocks = Math.min(memoryBlocks, 256);
      timeCost = 2;
      parallelism = 2;
      warnings.push('Optimized for integrated graphics with reduced parameters');
    }
  }
  
  return {
    memoryBlocks,
    timeCost,
    parallelism,
    warnings,
  };
}

// Monitor GPU memory usage during mining
export class GPUMemoryMonitor {
  private usageHistory: Array<{timestamp: number, utilization: number}> = [];
  
  constructor(_adapter: GPUAdapter, _device: GPUDevice, _memoryInfo: GPUMemoryInfo) {
    // Store parameters if needed later
  }
  
  // Estimate current memory usage (simplified)
  getCurrentUsage(): number {
    // This is a simplified estimation
    // Real implementation would track buffer allocations
    return this.usageHistory.length > 0 
      ? this.usageHistory[this.usageHistory.length - 1].utilization 
      : 0;
  }
  
  // Record memory usage
  recordUsage(utilization: number): void {
    this.usageHistory.push({
      timestamp: Date.now(),
      utilization,
    });
    
    // Keep only last 100 entries
    if (this.usageHistory.length > 100) {
      this.usageHistory = this.usageHistory.slice(-100);
    }
  }
  
  // Get memory usage statistics
  getUsageStats(): {
    current: number;
    average: number;
    peak: number;
  } {
    if (this.usageHistory.length === 0) {
      return { current: 0, average: 0, peak: 0 };
    }
    
    const current = this.usageHistory[this.usageHistory.length - 1].utilization;
    const average = this.usageHistory.reduce((sum, entry) => sum + entry.utilization, 0) / this.usageHistory.length;
    const peak = Math.max(...this.usageHistory.map(entry => entry.utilization));
    
    return { current, average, peak };
  }
  
  // Check for memory pressure
  checkMemoryPressure(): {
    level: 'low' | 'medium' | 'high' | 'critical';
    message: string;
  } {
    const stats = this.getUsageStats();
    
    if (stats.current > 90) {
      return {
        level: 'critical',
        message: `Critical memory usage: ${stats.current.toFixed(1)}%. Consider reducing mining parameters.`
      };
    } else if (stats.current > 80) {
      return {
        level: 'high',
        message: `High memory usage: ${stats.current.toFixed(1)}%. Monitor system performance.`
      };
    } else if (stats.current > 60) {
      return {
        level: 'medium',
        message: `Moderate memory usage: ${stats.current.toFixed(1)}%.`
      };
    } else {
      return {
        level: 'low',
        message: `Normal memory usage: ${stats.current.toFixed(1)}%.`
      };
    }
  }
}
