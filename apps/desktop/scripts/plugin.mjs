// Adds a plugin under development to the plugins installed on this machine, or removes it. Run from the plugin's
// folder:
//   node <path>/plugin.mjs add           after building the plugin into bundle/
//   node <path>/plugin.mjs remove <id>
//
// `add` takes the id from the plugin's manifest.json, copies it to <data folder>/plugins/<id>/, and links
// <data folder>/plugins/<id>/bundle to the plugin's bundle/, so a rebuild needs no second `add`, but a change to the
// manifest does. Restart Elsewise to load the change.
import fs from 'node:fs';
import path from 'node:path';
import { dataLocalDir, writeJsonSync } from '@elsewise/core';

const [command, argument] = process.argv.slice(2);
if (!(command === 'add' && argument === undefined) && !(command === 'remove' && argument !== undefined)) {
  console.error('usage: plugin.mjs add | plugin.mjs remove <id>');
  process.exit(1);
}

const id = command === 'add' ? JSON.parse(fs.readFileSync('manifest.json', 'utf8')).id : argument;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id ?? '')) {
  console.error(`[plugin] ${JSON.stringify(id)} is not a plugin id`);
  process.exit(1);
}

const file = path.join(dataLocalDir(), 'plugins.json');
const folder = path.join(dataLocalDir(), 'plugins', id);
const others = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []).filter(
  (plugin) => plugin.id !== id,
);

if (command === 'add') {
  const bundle = path.resolve('bundle');
  if (!fs.existsSync(path.join(bundle, 'main.js'))) {
    console.error(`[plugin] ${path.join(bundle, 'main.js')} not found (is the plugin built?)`);
    process.exit(1);
  }

  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync('manifest.json', path.join(folder, 'manifest.json'));
  fs.rmSync(path.join(folder, 'bundle'), { recursive: true, force: true });
  // A junction, as Windows only lets administrators create symbolic links.
  fs.symlinkSync(bundle, path.join(folder, 'bundle'), 'junction');
  writeJsonSync(file, [...others, { id, enabled: true }]);
  console.log(`[plugin] added ${id} to ${file}`);
} else {
  // Removes the plugin's settings too, which sit beside its bundle.
  fs.rmSync(folder, { recursive: true, force: true });
  writeJsonSync(file, others);
  console.log(`[plugin] removed ${id} from ${file}`);
}
