import { Manifest, PluginId } from '@elsewise/plugin';
import * as z from 'zod';

export { PluginId };

export type InstalledPlugin = z.infer<typeof InstalledPlugin>;
export type InvalidPlugin = z.infer<typeof InvalidPlugin>;
export type PluginEntry = z.infer<typeof PluginEntry>;

/**
 * The plugins installed on this machine: the folders in `<data folder>/plugins`.
 */
export interface PluginsBridge {
  /**
   * Returns every installed plugin, enabled or not, and every folder whose manifest is missing or malformed.
   */
  load(): Promise<(InstalledPlugin | InvalidPlugin)[]>;

  /**
   * Replaces whether each plugin is enabled with `entries`.
   *
   * Throws an error if two of `entries` share an id.
   */
  save(entries: PluginEntry[]): Promise<void>;
}

/**
 * A plugin installed on this machine: a folder in `<data folder>/plugins` with a `manifest.json`.
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
   * The URL of the plugin's main module, e.g. `app://elsewise/plugins/hello/bundle/main.js`.
   */
  url: z.string(),
});

/**
 * A folder in `<data folder>/plugins` whose `manifest.json` is missing or malformed.
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
 * An entry in `<data folder>/plugins.json`.
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
