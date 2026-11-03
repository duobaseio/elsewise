import { peer } from '@elsewise/frontend-plugin/build';
import { defineConfig } from 'vite';

// The modules Elsewise shares with its plugins stay out of the bundle; it provides them at runtime.
export default defineConfig({
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: 'main' },
    rolldownOptions: { external: peer },
  },
});
