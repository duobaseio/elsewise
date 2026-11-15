import { InstalledPlugin, type InvalidPlugin, type PluginEntry } from '@elsewise/core';
import { Keymap, Theme } from '@elsewise/frontend-plugin';
import * as z from 'zod';

export type InstalledFrontendPlugin = z.infer<typeof InstalledFrontendPlugin>;

/**
 * The plugins installed on this machine in `<frontend data folder>/plugins`.
 */
export interface PluginsBridge {
  /**
   * Returns every installed plugin, enabled or not, and every folder whose manifest is missing or malformed.
   */
  load(): Promise<(InstalledFrontendPlugin | InvalidPlugin)[]>;

  /**
   * Returns the installed plugin with `id`, or `undefined` if none is installed.
   *
   * Throws an error if `id` is not a plugin id.
   */
  load(id: string): Promise<InstalledFrontendPlugin | InvalidPlugin | undefined>;

  /**
   * Replaces whether each plugin is enabled with `entries`.
   *
   * Throws an error if two of `entries` share an id.
   */
  save(entries: PluginEntry[]): Promise<void>;
}

/**
 * A plugin installed on this machine with its frontend part.
 */
export const InstalledFrontendPlugin = InstalledPlugin.extend({
  /**
   * The themes in the plugin's `frontend/themes` folder, each identified by its file name without `.json`.
   * `dusk` for `dusk.json`, or with why it could not be read.
   */
  themes: z.array(
    z.union([z.object({ id: z.string(), theme: Theme }), z.object({ id: z.string(), error: z.string() })]),
  ),
  /**
   * The keymaps in the plugin's `frontend/keymaps` folder, each identified by its file name without `.json`.
   */
  keymaps: z.array(
    z.union([z.object({ id: z.string(), keymap: Keymap }), z.object({ id: z.string(), error: z.string() })]),
  ),
});
