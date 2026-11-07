import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));

const external = Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@elsewise/'));

await fs.rm('dist', { recursive: true, force: true });
await installDependencies();
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/daemon.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  external,
  define: { DAEMON_VERSION: JSON.stringify(manifest.version) },
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
});

/** Installs the production dependencies into `dist/node_modules`. */
async function installDependencies() {
  const staging = path.join('dist', 'deploy');
  const args = ['--filter', manifest.name, 'deploy', '--prod', '--legacy', '--config.node-linker=hoisted', staging];
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`pnpm deploy exited with ${result.status ?? result.signal}`);
  }
  await fs.rename(path.join(staging, 'node_modules'), path.join('dist', 'node_modules'));
  await fs.rm(staging, { recursive: true });
}
