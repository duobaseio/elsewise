import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 15_000, // Leaves room for a few polls.
    expect: {
      poll: {
        timeout: 5_000, // Extended for slow gha runners.
      },
    },
  },
});
