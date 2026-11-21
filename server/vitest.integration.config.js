import { defineConfig } from 'vitest/config';

// Spins up an in-memory MongoDB replica set. The first run downloads a MongoDB binary (needs internet).
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/integration/**/*.test.js'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
