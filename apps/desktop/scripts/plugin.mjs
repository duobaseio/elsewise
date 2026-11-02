// Adds a plugin under development to the plugins installed on this machine, or removes it. Run from the plugin's
// folder:
//   node <path>/plugin.mjs add           after building the plugin into dist/
//   node <path>/plugin.mjs remove <id>
//
// `add` takes the id from the plugin's manifest.json, copies it to <frontend data folder>/plugins/<id>/, and
// links <frontend data folder>/plugins/<id>/frontend to the plugin's dist/frontend/, so a rebuild needs no second
// `add`, but a change to the manifest does. Restart Elsewise to load the change.
// TODO: Link dist/daemon into the daemon's plugins folder, once the daemon loads plugins.
import fs from 'node:fs';
import path from 'node:path';
import { frontendDataDir, writeJsonSync } from '@elsewise/core';

const [command, argument] = process.argv.slice(2);
if (!(command === 'add' && argument === undefined) && !(command === 'remove' && argument !== undefined)) {
  console.error('usage: plugin.mjs add | plugin.mjs remove <id>');
  process.exit(1);
}

const manifest = command === 'add' ? JSON.parse(fs.readFileSync('manifest.json', 'utf8')) : undefined;
const id = command === 'add' ? manifest.id : argument;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id ?? '')) {
  console.error(`[plugin] ${JSON.stringify(id)} is not a plugin id`);
  process.exit(1);
}

const file = path.join(frontendDataDir(), 'plugins.json');
const folder = path.join(frontendDataDir(), 'plugins', id);
const others = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []).filter(
  (plugin) => plugin.id !== id,
);

if (command === 'add') {
  if (manifest.frontend === undefined) {
    console.error('[plugin] manifest.json has no frontend part');
    process.exit(1);
  }

  const frontend = path.resolve('dist', 'frontend');
  const main = path.join(frontend, manifest.frontend.main ?? 'main.js');
  if (!fs.existsSync(main)) {
    console.error(`[plugin] ${main} not found (is the plugin built?)`);
    process.exit(1);
  }

  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync('manifest.json', path.join(folder, 'manifest.json'));
  fs.rmSync(path.join(folder, 'frontend'), { recursive: true, force: true });
  // A junction, as Windows only lets administrators create symbolic links.
  fs.symlinkSync(frontend, path.join(folder, 'frontend'), 'junction');
  writeJsonSync(file, [...others, { id, enabled: true }]);
  console.log(`[plugin] added ${id} to ${file}`);
} else {
  // Removes the plugin's settings too, which sit in its folder.
  fs.rmSync(folder, { recursive: true, force: true });
  writeJsonSync(file, others);
  console.log(`[plugin] removed ${id} from ${file}`);
}
