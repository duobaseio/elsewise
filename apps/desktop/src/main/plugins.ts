import fs from 'node:fs';
import path from 'node:path';
import { type InstalledPlugin, type InvalidPlugin, PluginEntry, PluginId } from '@elsewise/bridge';
import { frontendDataDir, writeJsonSync } from '@elsewise/core';
import { Keymap, Manifest, Theme } from '@elsewise/frontend-plugin';
import { ipcMain } from 'electron';
import * as z from 'zod';
import { readJsonFolder } from '../fs/json-folder';

const PLUGINS = path.join(frontendDataDir(), 'plugins.json');
const ROOT = path.join(frontendDataDir(), 'plugins');

/**
 * Handles the renderer's `plugins:load` and `plugins:save`.
 *
 * A load returns each folder in `<frontend data folder>/plugins` with its `manifest.json`, the themes and keymaps in
 * its bundle, and whether `<frontend data folder>/plugins.json` enables it. Given an id, it returns only that folder,
 * or `undefined` if there is none.
 *
 * A save replaces `plugins.json`.
 *
 * Both reject a malformed `plugins.json` rather than repair it, so a save never silently overwrites entries a load
 * dropped.
 */
export function handlePlugins(): void {
  ipcMain.handle(
    'plugins:load',
    (_event, id?: unknown): (InstalledPlugin | InvalidPlugin)[] | InstalledPlugin | InvalidPlugin | undefined => {
      // No `plugins.json` means no entries, so every plugin is disabled.
      let entries: PluginEntry[] = [];
      try {
        entries = validate(JSON.parse(fs.readFileSync(PLUGINS, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      const enabled = new Set(entries.filter((entry) => entry.enabled).map((entry) => entry.id));

      if (id !== undefined) {
        const parsed = PluginId.safeParse(id);
        if (!parsed.success) {
          throw new Error('plugins: not a plugin id');
        }

        return fs.statSync(path.join(ROOT, parsed.data), { throwIfNoEntry: false })?.isDirectory()
          ? load(parsed.data, enabled.has(parsed.data))
          : undefined;
      }

      let folders: string[];
      try {
        folders = fs
          .readdirSync(ROOT)
          .filter((folder) => fs.statSync(path.join(ROOT, folder), { throwIfNoEntry: false })?.isDirectory());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }

      return folders.sort().map((folder) => load(folder, enabled.has(folder)));
    },
  );
  ipcMain.handle('plugins:save', (_event, plugins: unknown) => {
    writeJsonSync(PLUGINS, validate(plugins));
  });
}

// Returns `entries` without unknown properties. Throws if it isn't an array of entries, or two share an id.
function validate(entries: unknown): PluginEntry[] {
  if (!Array.isArray(entries)) {
    throw new Error('plugins: not an array');
  }

  const ids = new Set<string>();
  return entries.map((entry, index) => {
    const parsed = PluginEntry.safeParse(entry);
    if (!parsed.success) {
      throw new Error(`plugins: entry ${index} is malformed`);
    }
    if (ids.has(parsed.data.id)) {
      throw new Error(`plugins: two plugins share the id ${parsed.data.id}`);
    }

    ids.add(parsed.data.id);
    return parsed.data;
  });
}

// Returns the plugin in `folder` with its manifest, or with why it failed when it has none, it is malformed, or it
// declares an id other than `folder`.
function load(folder: string, enabled: boolean): InstalledPlugin | InvalidPlugin {
  const file = path.join(ROOT, folder, 'manifest.json');
  let json: string;
  try {
    json = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { id: folder, enabled, error: `${file} does not exist` };
    }
    return { id: folder, enabled, error: `failed to read ${file}: ${(error as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { id: folder, enabled, error: `${file} is not JSON: ${(error as Error).message}` };
  }

  const manifest = Manifest.safeParse(parsed);
  if (!manifest.success) {
    return { id: folder, enabled, error: `${file} is malformed:\n${z.prettifyError(manifest.error)}` };
  }

  if (manifest.data.id !== folder) {
    return { id: folder, enabled, error: `${file} declares the id ${manifest.data.id}, not its folder's name` };
  }

  return {
    manifest: manifest.data,
    enabled,
    themes: readJsonFolder(path.join(ROOT, folder, 'bundle', 'themes'), Theme).map((entry) =>
      'error' in entry ? entry : { id: entry.id, theme: entry.content },
    ),
    keymaps: readJsonFolder(path.join(ROOT, folder, 'bundle', 'keymaps'), Keymap).map((entry) =>
      'error' in entry ? entry : { id: entry.id, keymap: entry.content },
    ),
    // TODO: Leave out for a manifest without a frontend part, and serve from `bundle/frontend`, once the hosts check
    // the manifest's host range.
    url: `app://elsewise/plugins/${folder}/bundle/${manifest.data.frontend?.main ?? 'main.js'}`,
  };
}
