import { peer } from '@elsewise/frontend-plugin/build';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/frontend',
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: 'main' },
    rolldownOptions: { external: peer },
  },
});
