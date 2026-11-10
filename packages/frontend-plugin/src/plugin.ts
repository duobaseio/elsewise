import type { Disposable } from '@elsewise/plugin';
import type { AnyRouter } from '@tanstack/react-router';
import type { ActiveKeymap, Commands } from './command';
import type { Editor } from './editor/editor';
import type { FileTree } from './file-tree';
import type { FrontendSettings } from './frontend-settings';
import type { Platform } from './platform';
import type { Projects } from './projects/projects';
import type { Workspace } from './projects/workspaces';
import type { Settings } from './settings';
import type { Terminal } from './terminal';
import type { ThemeVariant } from './theme';

/**
 * The paths of Elsewise's pages.
 *
 * See {@link Application.router}.
 */
export const DEFAULT_ROUTES = {
  /**
   * The page shown without a workspace.
   */
  home: '/',
  /**
   * Returns the path of the workspace with `workspaceId`, in the project with `projectId` on the daemon with
   * `daemonId`.
   */
  workspace: (daemonId: string, projectId: string, workspaceId: string) =>
    `/${encodeURIComponent(daemonId)}/${encodeURIComponent(projectId)}/${encodeURIComponent(workspaceId)}` as const,
  settings: {
    /**
     * The settings page last open, or General otherwise.
     */
    last: '/settings',
    general: '/settings/local/appearance/general',
    keymap: '/settings/local/appearance/keymap',
    editor: '/settings/local/appearance/editor',
    terminal: '/settings/local/appearance/terminal',
  },
} as const;

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
 *         app.commands.addGroups([...]),
 *         app.commands.add([...]),
 *         app.editor.addContextMenu([...]),
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

  /**
   * Called with the frontend's new settings when they change, while the plugin is enabled.
   */
  onFrontendSettingsChange?(settings: FrontendSettings): void;

  /**
   * Called with the workspace shown when another is shown or it changes, while the plugin is enabled.
   */
  onWorkspaceChange?(workspace: Workspace | null): void;
}

/**
 * The application.
 */
export interface Application {
  /**
   * The underlying platform that hosts the frontend.
   */
  readonly platform: Platform;

  /**
   * The interface's appearance.
   */
  readonly appearance: Appearance;

  /**
   * The commands.
   */
  readonly commands: Commands;

  /**
   * The router, for opening a page.
   *
   * See {@link DEFAULT_ROUTES}.
   */
  readonly router: AnyRouter;

  /**
   * The settings.
   */
  readonly settings: Settings;

  /**
   * The projects.
   */
  readonly projects: Projects;

  /**
   * The code editor.
   */
  readonly editor: Editor;

  /**
   * The terminal.
   */
  readonly terminal: Terminal;

  /**
   * The file tree.
   */
  readonly fileTree: FileTree;
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
