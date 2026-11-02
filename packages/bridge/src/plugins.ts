import { Keymap, Manifest, PluginId, Theme } from '@elsewise/frontend-plugin';
import * as z from 'zod';

export { PluginId };

export type InstalledPlugin = z.infer<typeof InstalledPlugin>;
export type IncompatiblePlugin = z.infer<typeof IncompatiblePlugin>;
export type InvalidPlugin = z.infer<typeof InvalidPlugin>;
export type PluginEntry = z.infer<typeof PluginEntry>;

/**
 * The plugins installed on this machine in `<frontend data folder>/plugins`.
 */
export interface PluginsBridge {
  /**
   * Returns every installed plugin, enabled or not, every incompatible plugin, and every folder whose manifest is
   * missing or malformed.
   */
  load(): Promise<(InstalledPlugin | IncompatiblePlugin | InvalidPlugin)[]>;

  /**
   * Returns the installed plugin with `id`, or `undefined` if none is installed.
   *
   * Throws an error if `id` is not a plugin id.
   */
  load(id: string): Promise<InstalledPlugin | IncompatiblePlugin | InvalidPlugin | undefined>;

  /**
   * Replaces whether each plugin is enabled with `entries`.
   *
   * Throws an error if two of `entries` share an id.
   */
  save(entries: PluginEntry[]): Promise<void>;
}

/**
 * A plugin installed on this machine: a folder in `<frontend data folder>/plugins` with a `manifest.json`.
 */
export const InstalledPlugin = z.object({
  /**
   * The plugin's `manifest.json`.
   */
  manifest: Manifest,
  /**
   * Whether the plugin is enabled.
   */
  enabled: z.boolean(),
  /**
   * The themes in the plugin's `bundle/themes` folder, each identified by its file name without `.json`.
   * `dusk` for `dusk.json`, or with why it could not be read.
   */
  themes: z.array(
    z.union([z.object({ id: z.string(), theme: Theme }), z.object({ id: z.string(), error: z.string() })]),
  ),
  /**
   * The keymaps in the plugin's `bundle/keymaps` folder, each identified by its file name without `.json`.
   */
  keymaps: z.array(
    z.union([z.object({ id: z.string(), keymap: Keymap }), z.object({ id: z.string(), error: z.string() })]),
  ),
  /**
   * The URL of the plugin's frontend part's main module, e.g. `app://elsewise/plugins/hello/bundle/main.js`. Absent
   * for a plugin without a frontend part.
   */
  url: z.string().optional(),
});

/**
 * A plugin which is compatible with eithr Elsewise or other dependent plugins.
 */
export const IncompatiblePlugin = z.object({
  /**
   * The plugin's `manifest.json`.
   */
  manifest: Manifest,
  /**
   * Whether the plugin is enabled.
   */
  enabled: z.boolean(),
  /**
   * The manifest field which range is not satisfied.
   */
  unsatisfied: z.literal('elsewise'),
});

/**
 * A folder in `<frontend data folder>/plugins` whose `manifest.json` is missing or malformed.
 */
export const InvalidPlugin = z.object({
  /**
   * The name of the folder.
   */
  id: z.string(),
  /**
   * Whether the plugin is enabled.
   */
  enabled: z.boolean(),
  /**
   * Why the plugin's `manifest.json` could not be read.
   */
  error: z.string(),
});

/**
 * An entry in `<frontend data folder>/plugins.json`.
 */
export const PluginEntry = z.object({
  /**
   * The plugin's id, as its manifest declares.
   */
  id: PluginId,
  /**
   * Whether the plugin is enabled.
   */
  enabled: z.boolean(),
});
