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
/**
 * A plugin installed on this machine.
 */
export interface InstalledPlugin {
  /**
   * The plugin's id, typically reverse domain name notation, e.g. `io.duobase.elsewise`.
   */
  readonly id: string;

  /**
   * The plugin's display name.
   */
  readonly name: string;

  /**
   * The plugin's version, typically following SemVer, e.g. `1.2.3`.
   */
  readonly version: string;

  /**
   * The URL of the plugin's main module, e.g. `app://elsewise/plugins/hello/main.js`.
   */
  readonly url: string;

  /**
   * Whether the plugin is enabled.
   */
  readonly enabled: boolean;
}
