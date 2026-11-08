import path from 'node:path';
import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import type { InstalledPlugin, InvalidPlugin } from '@elsewise/core';
import { frontendDataDir, parsePluginEntries, readPluginsSync, writeJsonSync } from '@elsewise/core/node';
import { Keymap, Theme } from '@elsewise/frontend-plugin';
import { ipcMain } from 'electron';
import { readJsonFolder } from '../fs/json-folder';

const PLUGINS = path.join(frontendDataDir(), 'plugins.json');
const ROOT = path.join(frontendDataDir(), 'plugins');

/**
 * Handles the renderer's `plugins:load` and `plugins:save`.
 *
 * A load returns each folder in `<frontend data folder>/plugins` with its `manifest.json`, the themes and keymaps in
 * its frontend part, and whether `<frontend data folder>/plugins.json` enables it. Given an id, it returns only that
 * folder, or `undefined` if there is none.
 *
 * A save replaces `plugins.json`.
 *
 * Both reject a malformed `plugins.json` rather than repair it, so a save never silently overwrites entries a load
 * dropped.
 */
export function handlePlugins(): void {
  ipcMain.handle(
    'plugins:load',
    (
      _event,
      id?: unknown,
    ): (InstalledFrontendPlugin | InvalidPlugin)[] | InstalledFrontendPlugin | InvalidPlugin | undefined => {
      if (id !== undefined) {
        const plugin = readPluginsSync(ROOT, PLUGINS, id);
        return plugin === undefined ? undefined : withData(plugin);
      }
      return readPluginsSync(ROOT, PLUGINS).map(withData);
    },
  );
  ipcMain.handle('plugins:save', (_event, plugins: unknown) => {
    writeJsonSync(PLUGINS, parsePluginEntries(plugins));
  });
}

function withData(plugin: InstalledPlugin | InvalidPlugin): InstalledFrontendPlugin | InvalidPlugin {
  if ('error' in plugin) {
    return plugin;
  }

  const { manifest } = plugin;
  return {
    ...plugin,
    themes: readJsonFolder(path.join(ROOT, manifest.id, 'frontend', 'themes'), Theme).map((entry) =>
      'error' in entry ? entry : { id: entry.id, theme: entry.content },
    ),
    keymaps: readJsonFolder(path.join(ROOT, manifest.id, 'frontend', 'keymaps'), Keymap).map((entry) =>
      'error' in entry ? entry : { id: entry.id, keymap: entry.content },
    ),
    ...(manifest.frontend.main !== undefined && {
      url: `app://elsewise/plugins/${manifest.id}/frontend/${manifest.frontend.main}`,
    }),
  };
}
