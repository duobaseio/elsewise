import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { elsewise: 'src/main.ts' },
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  hash: false,
});
