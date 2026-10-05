import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/daemon.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
});
