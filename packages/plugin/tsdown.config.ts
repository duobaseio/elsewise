import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', 'elsewise-plugin': 'bin/elsewise-plugin.mjs' },
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  hash: false,
  dts: true,
});
