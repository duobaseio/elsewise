// Adds a plugin under development to the plugins installed on this machine, or removes it. Run from the plugin's
// folder:
//   node <path>/plugin.mjs add [folder]  e.g. add dist after building the plugin into dist/
//   node <path>/plugin.mjs remove <id>
//
// `add` takes a plugin laid out as installed: manifest.json, and a folder per part. It defaults to the current folder,
// as a plugin without code has no build. It takes the id from the manifest and installs each part it has on that
// part's side: the frontend part under <frontend data folder>, the daemon part under <daemon data folder>, or the
// folder ELSEWISE_DAEMON_DATA names. On each side, it copies the manifest to plugins/<id>/ and links plugins/<id>/<part>
// to <folder>/<part>/. A rebuild needs no second `add`, but a change to the manifest does. Restart Elsewise, and the
// daemon, to load the change.
import fs from 'node:fs';
import path from 'node:path';
import { daemonDataDir, frontendDataDir, writeJsonSync } from '@elsewise/core/node';

const [command, argument] = process.argv.slice(2);
if (command !== 'add' && !(command === 'remove' && argument !== undefined)) {
  console.error('usage: plugin.mjs add [folder] | plugin.mjs remove <id>');
  process.exit(1);
}

const root = command === 'add' ? path.resolve(argument ?? '.') : undefined;
const manifest = command === 'add' ? JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) : undefined;
const id = command === 'add' ? manifest.id : argument;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id ?? '')) {
  console.error(`[plugin] ${JSON.stringify(id)} is not a plugin id`);
  process.exit(1);
}

const sides = {
  frontend: frontendDataDir(),
  daemon: process.env.ELSEWISE_DAEMON_DATA ?? daemonDataDir(),
};

if (command === 'add') {
  if (manifest.frontend === undefined) {
    console.error('[plugin] manifest.json has no frontend part');
    process.exit(1);
  }

  // Every part is checked before any side changes, so a missing build leaves nothing half-installed.
  const sources = {};
  for (const part of Object.keys(sides).filter((part) => manifest[part] !== undefined)) {
    // A frontend part without a main module ships only data.
    const main = part === 'frontend' ? manifest.frontend.main : (manifest.daemon.main ?? 'main.js');
    const source = path.join(root, part);
    const required = main === undefined ? source : path.join(source, main);
    if (!fs.existsSync(required)) {
      console.error(`[plugin] ${required} not found${main === undefined ? '' : ' (is the plugin built?)'}`);
      process.exit(1);
    }
    sources[part] = source;
  }

  for (const [part, source] of Object.entries(sources)) {
    const folder = path.join(sides[part], 'plugins', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(root, 'manifest.json'), path.join(folder, 'manifest.json'));
    fs.rmSync(path.join(folder, part), { recursive: true, force: true });
    // A junction, as Windows only lets administrators create symbolic links.
    fs.symlinkSync(source, path.join(folder, part), 'junction');
    flag(part, true);
  }
} else {
  for (const part of Object.keys(sides)) {
    // Removes the plugin's settings too, which sit in its folder.
    fs.rmSync(path.join(sides[part], 'plugins', id), { recursive: true, force: true });
    flag(part, false);
  }
}

// Flags the plugin in the side's plugins.json, or drops it.
function flag(part, enabled) {
  const file = path.join(sides[part], 'plugins.json');
  const others = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []).filter(
    (plugin) => plugin.id !== id,
  );
  writeJsonSync(file, enabled ? [...others, { id, enabled }] : others);
  console.log(`[plugin] ${enabled ? 'added' : 'removed'} ${id} ${enabled ? 'to' : 'from'} ${file}`);
}
