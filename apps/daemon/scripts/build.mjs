import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

/** Bundles `@parcel/watcher` with its native binary for the platform the build runs on. */
const nativeWatcher = {
  name: 'native-watcher',
  setup({ onLoad }) {
    const entry = require.resolve('@parcel/watcher');
    const watcher = createRequire(entry);
    let name = `@parcel/watcher-${process.platform}-${process.arch}`;
    if (process.platform === 'linux') {
      name += watcher('detect-libc').familySync() === 'musl' ? '-musl' : '-glibc';
    }
    const binary = watcher.resolve(name);

    onLoad({ filter: /[\\/]@parcel[\\/]watcher[\\/]index\.js$/ }, () => ({
      contents: `module.exports = require('./wrapper').createWrapper(require(${JSON.stringify(binary)}));`,
      resolveDir: path.dirname(entry),
    }));
  },
};

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/daemon.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
  plugins: [nativeWatcher],
  loader: { '.node': 'copy' },
  assetNames: '[name]',
});
