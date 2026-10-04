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
   * The interface's appearance.
   */
  readonly appearance: Appearance;

  /**
   * The plugin's disposables, called in reverse order when Elsewise disables the plugin.
   */
  readonly subscriptions: Disposable[];
}

/**
 * The interface's appearance.
 */
export interface Appearance {
  /**
   * The application's brightness.
   */
  readonly brightness: 'light' | 'dark';

  /**
   * Registers a `listener` that is called with the new brightness when it changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  onBrightnessChange(listener: (brightness: 'light' | 'dark') => void): Disposable;
}

/**
 * A function that releases a resource when called.
 */
export type Disposable = () => void;
