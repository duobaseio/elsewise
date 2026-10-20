import type { ActiveKeymap, Commands } from './command.ts';
import type { Editor } from './editor/editor.ts';
import type { ThemeVariant } from './theme.ts';

/**
 * A `Plugin`.
 *
 * To create a plugin, declare the following default function in your project's main module:
 * ```ts
 * export default function ({ id }: PluginInfo): Plugin {
 *   return {
 *     async onEnable(app) {
 *       const index = await buildIndex();
 *       return [
 *         app.commands.add([...]),
 *         app.editor.addContextMenus([...]),
 *         () => index.close(),
 *       ];
 *     },
 *   };
 * }
 * ```
 */
export interface Plugin {
  /**
   * Called when the plugin is enabled.
   *
   * The disposables it returns are disposed in reverse order when the plugin is disabled. It is recommended to avoid
   * computationally expensive and high latency operations in this function since it may affect start-up time.
   *
   * Throwing an error causes the plugin to be disabled (without calling `onDisable`). It is the plugin's responsibility
   * to safely dispose of any added items in such cases.
   */
  onEnable?(app: Application): Disposable[] | undefined | Promise<Disposable[] | undefined>;

  /**
   * Called when the plugin is disabled, before the disposables `onEnable` returned are disposed.
   */
  onDisable?(app: Application): void | Promise<void>;

  /**
   * Called with the new brightness when it changes, while the plugin is enabled.
   */
  onBrightnessChange?(brightness: 'light' | 'dark'): void;

  /**
   * Called with the new theme when it changes, while the plugin is enabled.
   */
  onThemeChange?(theme: ActiveTheme): void;

  /**
   * Called with the new keymap when it changes, while the plugin is enabled.
   */
  onKeymapChange?(keymap: ActiveKeymap): void;
}

/**
 * The plugin's information which is passed to a plugin main module's default export function.
 *
 * See {@link Plugin}.
 */
export interface PluginInfo {
  /** The plugin's id. */
  readonly id: string;
}

/**
 * The application.
 */
export interface Application {
  /**
   * The interface's appearance.
   */
  readonly appearance: Appearance;

  /**
   * The commands.
   */
  readonly commands: Commands;

  /**
   * The code editor.
   */
  readonly editor: Editor;
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
   * The colors of the interface, editor and terminal.
   */
  readonly theme: ActiveTheme;
}

/**
 * The colors of the interface, editor and terminal, each under its selected theme and the brightness.
 */
export interface ActiveTheme {
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
 *
 * Elsewise waits for it if it returns a promise.
 */
export type Disposable = () => void | Promise<void>;
