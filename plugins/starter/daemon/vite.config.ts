import { defineConfig } from 'vite';

// A server build, for Node. The daemon shares no modules with its plugins, so everything the part imports is bundled.
export default defineConfig({
  build: {
    outDir: '../dist/daemon',
    emptyOutDir: true,
    ssr: 'src/main.ts',
    rolldownOptions: { output: { entryFileNames: 'main.js' } },
  },
  ssr: { noExternal: true },
});
