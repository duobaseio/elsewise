import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, PluginId, Settings } from '@elsewise/bridge';
import { configLocalDir, frontendDataDir, writeJsonSync } from '@elsewise/core/node';
import { Keymap, Theme } from '@elsewise/frontend-plugin';
import { BrowserWindow, ipcMain } from 'electron';
import { readJsonFolder } from '../fs/json-folder';

/**
 * Handles the renderer's settings channels:
 * - `settings:load` and `settings:save` read and replace `<config folder>/settings.json`.
 * - `settings:load-plugin` and `settings:save-plugin` read and replace
 *   `<frontend data folder>/plugins/<id>/settings.json`.
 * - `settings:load-user-themes`, `settings:save-user-theme` and `settings:delete-user-theme` read, replace and delete
 *   the user's themes in `<config folder>/themes`.
 * - `settings:load-user-keymaps`, `settings:save-user-keymap` and `settings:delete-user-keymap` do the same for the
 *   user's keymaps in `<config folder>/keymaps`.
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
  ipcMain.handle('settings:load-user-themes', () =>
    readJsonFolder(path.join(configLocalDir(), 'themes'), Theme).map((entry) =>
      'error' in entry ? entry : { id: entry.id, theme: entry.content },
    ),
  );
  ipcMain.handle('settings:save-user-theme', (_event, id: unknown, theme: unknown) => {
    writeJsonSync(userFile('themes', id), Theme.parse(theme));
  });
  ipcMain.handle('settings:delete-user-theme', (_event, id: unknown) => {
    fs.rmSync(userFile('themes', id), { force: true });
  });
  ipcMain.handle('settings:load-user-keymaps', () =>
    readJsonFolder(path.join(configLocalDir(), 'keymaps'), Keymap).map((entry) =>
      'error' in entry ? entry : { id: entry.id, keymap: entry.content },
    ),
  );
  ipcMain.handle('settings:save-user-keymap', (_event, id: unknown, keymap: unknown) => {
    writeJsonSync(userFile('keymaps', id), Keymap.parse(keymap));
  });
  ipcMain.handle('settings:delete-user-keymap', (_event, id: unknown) => {
    fs.rmSync(userFile('keymaps', id), { force: true });
  });
}

function pluginFile(plugin: unknown): string {
  const id = PluginId.safeParse(plugin);
  if (!id.success) {
    throw new Error(`settings: invalid plugin id ${JSON.stringify(plugin)}`);
  }

  return path.join(frontendDataDir(), 'plugins', id.data, 'settings.json');
}

function userFile(folder: 'themes' | 'keymaps', id: unknown): string {
  const parsed = PluginId.safeParse(id);
  if (!parsed.success) {
    throw new Error(`settings: invalid ${folder === 'themes' ? 'theme' : 'keymap'} id ${JSON.stringify(id)}`);
  }

  return path.join(configLocalDir(), folder, `${parsed.data}.json`);
}

export function watchUserThemesAndKeymaps(): () => void {
  fs.mkdirSync(path.join(configLocalDir(), 'themes'), { recursive: true });
  fs.mkdirSync(path.join(configLocalDir(), 'keymaps'), { recursive: true });

  const timers = new Map<'themes' | 'keymaps', ReturnType<typeof setTimeout>>();
  const watcher = fs.watch(configLocalDir(), { recursive: true }, (_, file) => {
    const folder = file === null ? undefined : path.dirname(file);
    if ((folder !== 'themes' && folder !== 'keymaps') || path.extname(file ?? '') !== '.json') {
      return;
    }

    clearTimeout(timers.get(folder));
    timers.set(
      folder,
      setTimeout(() => {
        timers.delete(folder);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('settings:changed', folder);
        }
      }, 100),
    );
  });

  return () => {
    watcher.close();
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
  };
}
