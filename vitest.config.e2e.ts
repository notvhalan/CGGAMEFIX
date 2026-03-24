import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load test env vars
config({ path: resolve(__dirname, 'tests/e2e/.env.test') });

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',        // each test file gets its own process (no shared state leaks)
    poolOptions: {
      forks: { singleFork: true },  // run files sequentially — they share a DB
    },
    globals: true,
  },
});
