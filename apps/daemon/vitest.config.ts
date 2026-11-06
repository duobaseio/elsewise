import { configDefaults, defineConfig } from 'vitest/config';
import manifest from './package.json' with { type: 'json' };

export default defineConfig({
  define: { DAEMON_VERSION: JSON.stringify(manifest.version) },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/**/*.bundle.test.ts'],
    testTimeout: 15_000, // Leaves room for a few polls.
    expect: {
      poll: {
        timeout: 5_000, // Extended for slow gha runners.
      },
    },
  },
});
