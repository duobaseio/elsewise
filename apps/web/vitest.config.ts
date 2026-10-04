import { defineConfig } from 'vitest/config';

// Separate from `vite.config.ts`, whose plugins build the app and aren't needed to test it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts'],
    // Vitest empties CSS, even imported `?raw`, unless included here. The themes' tests compare against elsewise.css.
    css: { include: [/elsewise\.css/] },
  },
});
