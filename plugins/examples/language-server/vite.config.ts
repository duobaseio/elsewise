import { peer } from '@elsewise/plugin/build';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'bundle',
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: 'main' },
    rolldownOptions: { external: peer },
  },
});
