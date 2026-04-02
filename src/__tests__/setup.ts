/**
 * Vitest Test Setup for Glyph-miner
 */

import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
global.localStorage = localStorageMock as unknown as Storage;

// Mock crypto.getRandomValues
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock WebGPU (not available in jsdom)
const mockGPU = {
  requestAdapter: vi.fn().mockResolvedValue(null),
};
(global as any).navigator = {
  ...global.navigator,
  gpu: mockGPU,
};

console.log('🧪 Glyph-miner test environment initialized');
