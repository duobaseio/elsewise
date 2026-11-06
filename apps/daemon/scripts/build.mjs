import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));

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

/** Bundles `@lydell/node-pty` with the prebuilt binary for the platform the build runs on. */
const ptyEntry = require.resolve('@lydell/node-pty');
const ptyBinaries = createRequire(ptyEntry);
const ptyPackage = `@lydell/node-pty-${process.platform}-${process.arch}`;

const nativePty = {
  name: 'native-pty',
  setup({ onLoad }) {
    const binaries = process.platform === 'win32' ? ['conpty.node'] : ['pty.node'];
    onLoad({ filter: /[\\/]@lydell[\\/]node-pty[\\/]requireBinary\.js$/ }, () => ({
      contents: [
        'const binaries = {',
        ...binaries.map(
          (file) =>
            `  ${JSON.stringify(file)}: require(${JSON.stringify(ptyBinaries.resolve(`${ptyPackage}/${file}`))}),`,
        ),
        '};',
        'exports.requireBinary = (file) => binaries[file];',
      ].join('\n'),
      resolveDir: path.dirname(ptyEntry),
    }));
    // The spawn helper is resolved from the bundle's own directory instead of a node_modules.
    onLoad({ filter: /[\\/]@lydell[\\/]node-pty[\\/]unixTerminal\.js$/ }, async ({ path: file }) => {
      const source = await fs.readFile(file, 'utf8');
      const lookup = 'require.resolve(helperPath)';
      if (!source.includes(lookup)) {
        throw new Error(`${file} no longer finds the spawn helper with ${lookup}; the bundle needs a new patch`);
      }
      return {
        contents: source.replace(lookup, "require('node:path').join(__dirname, 'spawn-helper')"),
        resolveDir: path.dirname(file),
      };
    });
  },
};

/** Copies the files node-pty loads by path rather than requires, which esbuild cannot see, next to the bundle. */
async function copyPtyFiles() {
  // macOS starts each shell through the `spawn-helper` executable.
  if (process.platform === 'darwin') {
    await fs.copyFile(ptyBinaries.resolve(`${ptyPackage}/spawn-helper`), 'dist/spawn-helper');
    await fs.chmod('dist/spawn-helper', 0o755);
  }
  // Windows reads ConPTY output in a worker thread started from a script path.
  if (process.platform === 'win32') {
    const ptyRoot = path.dirname(ptyEntry);
    for (const file of ['worker/conoutSocketWorker.js', 'shared/conout.js']) {
      await fs.mkdir(path.join('dist', path.dirname(file)), { recursive: true });
      await fs.copyFile(path.join(ptyRoot, file), path.join('dist', file));
    }
  }
}

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/daemon.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  define: { DAEMON_VERSION: JSON.stringify(version) },
  banner: {
    js: [
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "const __dirname = require('node:path').dirname(require('node:url').fileURLToPath(import.meta.url));",
    ].join('\n'),
  },
  plugins: [nativeWatcher, nativePty],
  loader: { '.node': 'copy' },
  assetNames: '[name]',
});

await copyPtyFiles();
