// Adds a plugin under development to the plugins installed on this machine, or removes it. Run from the plugin's
// folder:
//   node <path>/plugin.mjs add <id> <name>     after building the plugin into bundle/
//   node <path>/plugin.mjs remove <id>
//
// `add` links <data folder>/plugins/<id>/bundle to the plugin's bundle/, so a rebuild needs no second `add`.
// Restart Elsewise to load the change.
import fs from 'node:fs';
import path from 'node:path';
import { dataLocalDir, writeJsonSync } from '@elsewise/fs';

const [command, id, name] = process.argv.slice(2);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id ?? '') || !(command === 'remove' || (command === 'add' && name))) {
  console.error('usage: plugin.mjs add <id> <name> | plugin.mjs remove <id>');
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

  const { version = '0.0.0' } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  fs.mkdirSync(folder, { recursive: true });
  fs.rmSync(path.join(folder, 'bundle'), { recursive: true, force: true });
  // A junction, as Windows only lets administrators create symbolic links.
  fs.symlinkSync(bundle, path.join(folder, 'bundle'), 'junction');
  writeJsonSync(file, [
    ...others,
    { id, name, version, url: `app://elsewise/plugins/${id}/bundle/main.js`, enabled: true },
  ]);
  console.log(`[plugin] added ${id} to ${file}`);
} else {
  // Removes the plugin's settings too, which sit beside its bundle.
  fs.rmSync(folder, { recursive: true, force: true });
  writeJsonSync(file, others);
  console.log(`[plugin] removed ${id} from ${file}`);
}
