import { defineConfig } from 'vitest/config';

// Fast unit and API tests. No database needed. Integration tests: `npm run test:db`.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['tests/integration/**', 'node_modules/**'],
  },
});
