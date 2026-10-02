import { defineConfig } from 'vitest/config';

// A test's runtime is carried by its name: `*.electron.test.ts` builds and launches the app, anything else runs in
// Node alone.
const ELECTRON_TESTS = 'src/**/*.electron.test.ts';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['src/**/*.test.ts'], exclude: [ELECTRON_TESTS] } },
      { test: { name: 'electron', include: [ELECTRON_TESTS], testTimeout: 60_000, hookTimeout: 60_000 } },
    ],
  },
});
