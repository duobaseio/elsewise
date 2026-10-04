import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, PluginId, Settings } from '@elsewise/bridge';
import { configLocalDir, dataLocalDir, writeJsonSync } from '@elsewise/fs';
import { ipcMain } from 'electron';

/**
 * Handles the renderer's settings channels:
 * - `settings:load` and `settings:save` read and replace `<config folder>/settings.json`.
 * - `settings:load-plugin` and `settings:save-plugin` read and replace `<data folder>/plugins/<id>/settings.json`.
 */
export function handleSettings(): void {
  ipcMain.handle('settings:load', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(configLocalDir(), 'settings.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('settings: unreadable, starting from defaults', error);
      }
      parsed = {};
    }

    return Settings.catch(DEFAULT_SETTINGS).parse(parsed);
  });
  ipcMain.handle('settings:save', (_event, value: unknown) => {
    writeJsonSync(path.join(configLocalDir(), 'settings.json'), Settings.parse(value));
  });
  ipcMain.handle('settings:load-plugin', (_event, plugin: unknown) => {
    try {
      return JSON.parse(fs.readFileSync(pluginFile(plugin), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  });
  ipcMain.handle('settings:save-plugin', (_event, plugin: unknown, value: unknown) => {
    const file = pluginFile(plugin);
    if (JSON.stringify(value) === undefined) {
      throw new Error(`settings: plugin ${plugin} saved a value that is not JSON`);
    }

    writeJsonSync(file, value);
  });
}

function pluginFile(plugin: unknown): string {
  const id = PluginId.safeParse(plugin);
  if (!id.success) {
    throw new Error(`settings: invalid plugin id ${JSON.stringify(plugin)}`);
  }

  return path.join(dataLocalDir(), 'plugins', id.data, 'settings.json');
}
