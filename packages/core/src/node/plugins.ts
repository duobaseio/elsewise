import fs from 'node:fs';
import path from 'node:path';
import { Manifest, PluginId } from '@elsewise/plugin';
import * as z from 'zod';
import { type InstalledPlugin, type InvalidPlugin, PluginEntry } from '../plugins/plugin.ts';

/**
 * Returns the plugins in `folder`, enabled as `pluginsManifest` says.
 *
 * Disables every plugin if `pluginsManifest` does not exist. Throws an error if it is malformed.
 */
export function readPluginsSync(folder: string, pluginsManifest: string): (InstalledPlugin | InvalidPlugin)[];

/**
 * Returns the plugin with `id` in `folder`, or `undefined` if it is not installed.
 *
 * Throws an error if `id` is not a plugin id.
 */
export function readPluginsSync(
  folder: string,
  pluginsManifest: string,
  id: unknown,
): InstalledPlugin | InvalidPlugin | undefined;

export function readPluginsSync(
  folder: string,
  pluginsManifest: string,
  id?: unknown,
): (InstalledPlugin | InvalidPlugin)[] | InstalledPlugin | InvalidPlugin | undefined {
  // No `plugins.json` means no entries, so every plugin is disabled.
  let entries: PluginEntry[] = [];
  try {
    entries = parsePluginEntries(JSON.parse(fs.readFileSync(pluginsManifest, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const enabled = new Set(entries.filter((entry) => entry.enabled).map((entry) => entry.id));

  if (id !== undefined) {
    const parsed = PluginId.safeParse(id);
    if (!parsed.success) {
      throw new Error(`plugins: ${id} is not a plugin id`);
    }

    return isFolder(path.join(folder, parsed.data)) ? read(folder, parsed.data, enabled.has(parsed.data)) : undefined;
  }

  let folders: string[];
  try {
    folders = fs.readdirSync(folder).filter((name) => isFolder(path.join(folder, name)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return folders.sort().map((name) => read(folder, name, enabled.has(name)));
}

/**
 * Returns `entries` without unknown properties.
 *
 * Throws an error if it is not a list of entries, or if two share an id.
 */
export function parsePluginEntries(entries: unknown): PluginEntry[] {
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

function isFolder(target: string): boolean {
  return fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function read(folder: string, name: string, enabled: boolean): InstalledPlugin | InvalidPlugin {
  const file = path.join(folder, name, 'manifest.json');
  let json: string;
  try {
    json = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { id: name, enabled, error: `${file} does not exist` };
    }
    return { id: name, enabled, error: `failed to read ${file}: ${(error as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { id: name, enabled, error: `${file} is not JSON: ${(error as Error).message}` };
  }

  const manifest = Manifest.safeParse(parsed);
  if (!manifest.success) {
    return { id: name, enabled, error: `${file} is malformed:\n${z.prettifyError(manifest.error)}` };
  }

  if (manifest.data.id !== name) {
    return { id: name, enabled, error: `${file} declares the id ${manifest.data.id}, not its folder's name` };
  }

  return { manifest: manifest.data, enabled };
}
