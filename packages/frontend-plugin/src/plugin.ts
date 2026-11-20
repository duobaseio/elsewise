import type { Disposable } from '@elsewise/plugin';
import type { AnyRouter } from '@tanstack/react-router';
import type { ActiveKeymap, Commands } from './command';
import type { Dock, Docks } from './dock/docks';
import type { Panel } from './dock/panels';
import type { Editor } from './editor/editor';
import type { FileTree } from './file-tree';
import type { FrontendSettings } from './frontend-settings';
import type { Platform } from './platform';
import type { Projects } from './projects/projects';
import type { Workspace } from './projects/workspaces';
import type { Settings } from './settings';
import type { Terminals, TerminalView } from './terminal';
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
     * The settings page last open, or Appearance otherwise.
     */
    last: '/settings',
    appearance: '/settings/local/appearance',
    keymap: '/settings/local/keymap',
    editor: '/settings/local/editor',
    fileTree: '/settings/local/file-tree',
    terminal: '/settings/local/terminal',
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
   * Called with the new brightness when it changes.
   */
  onBrightnessChange?(app: Application, brightness: 'light' | 'dark'): void;

  /**
   * Called with the new theme when it changes.
   */
  onThemeChange?(app: Application, theme: ActiveTheme): void;

  /**
   * Called with the new keymap when it changes.
   */
  onKeymapChange?(app: Application, keymap: ActiveKeymap): void;

  /**
   * Called with the frontend's new settings when they change.
   */
  onFrontendSettingsChange?(app: Application, settings: FrontendSettings): void;

  // TODO: We lack Daemon streaming RPC support for finding out about workspace opens/closes.

  /**
   * Called with the workspace shown when another is shown, or it changes.
   */
  onWorkspaceChange?(app: Application, workspace: Workspace | null): void;

  /**
   * Called with a terminal when it opens.
   */
  onTerminalOpen?(app: Application, view: TerminalView): void;

  /**
   * Called with a terminal when it closes.
   */
  onTerminalClose?(app: Application, view: TerminalView): void;

  /**
   * Called with a terminal when its session changes, e.g. when it is renamed or its shell exits.
   */
  onTerminalChange?(app: Application, view: TerminalView): void;

  /**
   * Called with a dock panel when it opens.
   *
   * It is not called when another workspace is shown.
   */
  onPanelOpen?(app: Application, dock: Dock, panel: Panel): void;

  /**
   * Called with a dock panel when it closes.
   *
   * It is not called when another workspace is shown.
   */
  onPanelClose?(app: Application, dock: Dock, panel: Panel): void;

  /**
   * Called with the dock of the workspace shown when another workspace is shown, or it changes, e.g. when a panel
   * opens, closes or moves, or another becomes active.
   *
   * It is called after `onPanelOpen` and `onPanelClose`.
   */
  onDockChange?(app: Application, dock: Dock | null): void;
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
   * The terminals.
   */
  readonly terminals: Terminals;

  /**
   * The file tree.
   */
  readonly fileTree: FileTree;

  /**
   * The docks.
   */
  readonly docks: Docks;
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
