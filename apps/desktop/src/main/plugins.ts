import fs from 'node:fs';
import path from 'node:path';
import { InstalledPlugin } from '@elsewise/bridge';
import { dataLocalDir, writeJsonSync } from '@elsewise/core';
import { ipcMain } from 'electron';

const FILE = path.join(dataLocalDir(), 'plugins.json');

/**
 * Handles the renderer's `plugins:load` and `plugins:save`, which read and replace `<data folder>/plugins.json`.
 *
 * Both reject a malformed list rather than repair it, so a save never silently overwrites plugins a load dropped.
 */
export function handlePlugins(): void {
  ipcMain.handle('plugins:load', () => {
    let json: string;
    try {
      json = fs.readFileSync(FILE, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return validate(JSON.parse(json));
  });
  ipcMain.handle('plugins:save', (_event, plugins: unknown) => {
    writeJsonSync(FILE, validate(plugins));
  });
}

// Returns `plugins` without unknown properties. Throws if it isn't an array of installed plugins, or two share an id.
function validate(plugins: unknown): InstalledPlugin[] {
  if (!Array.isArray(plugins)) {
    throw new Error('plugins: not an array');
  }

  const ids = new Set<string>();
  return plugins.map((plugin, index) => {
    const parsed = InstalledPlugin.safeParse(plugin);
    if (!parsed.success) {
      throw new Error(`plugins: plugin ${index} is malformed`);
    }
    if (ids.has(parsed.data.id)) {
      throw new Error(`plugins: two plugins share the id ${parsed.data.id}`);
    }

    ids.add(parsed.data.id);
    return parsed.data;
  });
}
