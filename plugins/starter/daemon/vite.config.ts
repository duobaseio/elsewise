import { linkNodeModules } from '@elsewise/daemon-plugin/build';
import { defineConfig } from 'vite';

// A server build, for Node. The daemon shares no modules with its plugins, so the part's `dependencies` stay as
// imports and ship beside the bundle in `node_modules`.
export default defineConfig({
  plugins: [linkNodeModules()],
  build: {
    outDir: '../dist/daemon',
    emptyOutDir: true,
    ssr: 'src/main.ts',
    rolldownOptions: { output: { entryFileNames: 'main.js' } },
  },
});
