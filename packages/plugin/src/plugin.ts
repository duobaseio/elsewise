/**
 * Represents an Elsewise plugin.
 */
export interface Plugin {
  /**
   * Called when Elsewise enables the plugin.
   */
  enable(context: PluginContext): void | Promise<void>;
}

/**
 * A plugin's access to Elsewise, passed to {@link Plugin.enable}.
 */
export interface PluginContext {
  /** The plugin's id. */
  readonly id: string;

  /**
   * The plugin's disposables, disposed in reverse order when Elsewise disables the plugin.
   */
  readonly subscriptions: Disposable[];
}

/**
 * A resource that is released when disposed.
 */
export interface Disposable {
  /**
   * Releases the resource.
   */
  dispose(): void;
}
