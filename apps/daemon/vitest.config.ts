import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    expect: {
      poll: {
        timeout: 5_000, // Extended for slow gha runners.
      },
    },
  },
});
