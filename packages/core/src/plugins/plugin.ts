import { Manifest, PluginId } from '@elsewise/plugin';
import * as z from 'zod';

export type InstalledPlugin = z.infer<typeof InstalledPlugin>;
export type InvalidPlugin = z.infer<typeof InvalidPlugin>;
export type PluginEntry = z.infer<typeof PluginEntry>;

/**
 * A plugin installed on this machine.
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
   * The URL of the part's main module. Absent if the plugin has no code for the part.
   */
  url: z.string().optional(),
});

/**
 * A plugin folder whose `manifest.json` is missing or malformed.
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
 * An entry in `plugins.json`.
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
