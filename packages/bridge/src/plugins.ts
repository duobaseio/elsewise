import * as z from 'zod';

/**
 * A plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
 */
export const PluginId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const SEMVER = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)` +
    String.raw`(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?` +
    String.raw`(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`,
);

/**
 * The plugins installed on this machine.
 */
export interface PluginsBridge {
  /**
   * Returns every installed plugin, enabled or not.
   */
  load(): Promise<InstalledPlugin[]>;

  /**
   * Replaces the installed plugins with `plugins`.
   *
   * Throws an error if two of `plugins` share an id.
   */
  save(plugins: InstalledPlugin[]): Promise<void>;
}

export type InstalledPlugin = z.infer<typeof InstalledPlugin>;

/**
 * A plugin installed on this machine.
 */
export const InstalledPlugin = z
  .object({
    /**
     * The plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
     */
    id: PluginId,

    /**
     * The plugin's display name. Cannot be blank.
     */
    name: z.string().regex(/\S/),

    /**
     * The plugin's version, following SemVer, e.g. `1.2.3`.
     */
    version: z.string().regex(SEMVER),

    /**
     * The URL of the plugin's main module, e.g. `app://elsewise/plugins/hello/bundle/main.js`. Cannot be blank.
     */
    url: z.string().regex(/\S/),

    /**
     * Whether the plugin is enabled.
     */
    enabled: z.boolean(),
  })
  .readonly();
