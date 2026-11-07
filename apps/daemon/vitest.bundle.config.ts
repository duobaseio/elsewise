import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.bundle.test.ts'],
    testTimeout: 30_000, // Leaves room for the daemon to start.
    hookTimeout: 30_000,
    expect: {
      poll: {
        timeout: 10_000, // Extended for slow gha runners.
      },
    },
  },
});
