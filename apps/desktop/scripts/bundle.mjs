// Bundles main and preload into out/, each as a single CommonJS file with its workspace dependencies inlined: the
// packaged app ships without node_modules, and a sandboxed preload cannot `require` other files.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
  outdir: 'out',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: true,
});
