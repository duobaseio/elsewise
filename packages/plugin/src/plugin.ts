import type { ThemeVariant } from './theme.ts';

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

  /**
   * The colors of the interface, editor and terminal.
   */
  readonly theme: ResolvedTheme;

  /**
   * Registers a `listener` that is called with the new theme when it changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  onThemeChange(listener: (theme: ResolvedTheme) => void): Disposable;
}

/**
 * The colors of the interface, editor and terminal, each under its selected theme and the brightness.
 */
export interface ResolvedTheme {
  /**
   * The interface's colors.
   */
  readonly interface: Readonly<Required<ThemeVariant['interface']>>;

  /**
   * The editor's colors and syntax highlighting.
   */
  readonly editor: Readonly<Required<ThemeVariant['editor']>>;

  /**
   * The terminal's colors.
   */
  readonly terminal: Readonly<Required<ThemeVariant['terminal']>>;
}

/**
 * A function that releases a resource when called.
 */
export type Disposable = () => void;
