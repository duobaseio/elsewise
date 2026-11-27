import type { Disposable } from '@elsewise/plugin';
import type { ComponentType } from 'react';
import type { Application } from '../plugin';
import type { Workspace } from '../projects/workspaces';
import type { TerminalOptions } from '../terminal';
import type { Group, Layout } from './layout';
import type { PanelMenuGroup } from './panel-menu';
import type { CustomPanel, FilePanel, Panel, TerminalPanel } from './panels';
import type { Placement } from './placement';

/**
 * The ids of the built-in sources.
 */
export const DEFAULT_PANEL_SOURCES = {
  terminal: '@elsewise/terminal',
} as const;

/**
 * The docks, one for each workspace.
 */
export interface Docks {
  /**
   * The dock of the workspace shown, or null on a page without one, e.g. the settings.
   */
  readonly active: Dock | null;

  /**
   * Adds sources of custom panels, each of which shows the panels whose type is its id.
   *
   * A source whose id already exists is omitted.
   *
   * Disposing it removes the sources and closes their panels, without calling `close`.
   */
  addPanelSources(sources: readonly CustomPanelSource[]): Disposable;

  /**
   * Adds `groups` to the panel menu, the menu of a tab group's button that adds a panel.
   *
   * ```ts
   * docks.addPanelMenu([
   *   { id: 'example.panels', order: 20, items: [{ order: 10, source: 'example/report' }] },
   * ]);
   * ```
   *
   * The button adds a panel at once, without a menu, while the menu has a single item.
   *
   * Returns a disposable that removes the `groups`.
   */
  addPanelMenu(groups: readonly PanelMenuGroup[]): Disposable;
}

/**
 * A workspace's dock, which arranges its panels in groups.
 */
export interface Dock {
  /**
   * The workspace that the dock belongs to.
   */
  readonly workspace: Workspace;

  /**
   * The shown panel that is or was last focused.
   *
   * `null` when no panel is shown.
   *
   * The active panel remains the same when focus is elsewhere (except on another panel), e.g. in a menu.
   */
  readonly activePanel: Panel | null;

  /**
   * The open tab panel that is or was last focused.
   *
   * `null` when no tab panel is open.
   */
  readonly activeTabPanel: Panel | null;

  /**
   * The open panels.
   */
  readonly panels: readonly Panel[];

  /**
   * The groups.
   */
  readonly groups: readonly Group[];

  /**
   * The arrangement of the groups, or null if there are none.
   */
  readonly layout: Layout | null;

  /**
   * Returns the open panel with the given id, or null otherwise.
   */
  get(id: string): Panel | null;

  /**
   * Adds a panel that shows the file at `relativePath`, relative to the root of the dock's workspace.
   *
   * The panel is shown, and becomes the active panel unless `activate` is false. Defaults to true.
   *
   * If the file is already open, `placement` is ignored.
   *
   * Returns the panel, or null if:
   * * the panel that `placement` refers to is not open
   * * `placement` is among tabs, and the panel that it refers to is tabless
   */
  addFile(relativePath: string, placement: Placement, activate?: boolean): FilePanel | null;

  /**
   * Adds a terminal, and a panel that shows it.
   *
   * The panel is shown, and becomes the active panel unless `activate` is false. Defaults to true.
   *
   * Returns the panel, or null if:
   * * the panel that `placement` refers to is not open
   * * `placement` is among tabs, and the panel that it refers to is tabless
   */
  addTerminal(options: TerminalOptions, placement: Placement, activate?: boolean): Promise<TerminalPanel | null>;

  /**
   * Adds a custom panel of `type`, the id of the source that shows it.
   *
   * The panel is shown, and becomes the active panel unless `activate` is false. Defaults to true.
   *
   * Returns the panel, or null if:
   * * no source with that id was added
   * * the panel that `placement` refers to is not open
   * * `placement` is among tabs, and either panel is tabless
   */
  addPanel(type: CustomPanel['type'], placement: Placement, activate?: boolean): CustomPanel | null;

  /**
   * Moves `panel` to `placement`.
   *
   * The panel is shown, and becomes the active panel if `activate` is true. Defaults to true.
   *
   * Does nothing if:
   * * `panel` is not open
   * * the panel that `placement` refers to is not open
   * * `placement` is among tabs, and either panel is tabless
   */
  move(panel: Panel, placement: Placement, activate?: boolean): void;

  /**
   * Shows `panel` and makes it the active panel.
   *
   * Does nothing if `panel` is not open.
   */
  activate(panel: Panel): void;

  /**
   * Shows `panel` in its group, and the group if it is hidden.
   *
   * Does nothing if `panel` is not open.
   */
  show(panel: Panel): void;

  /**
   * Hides the group that `panel` is in.
   *
   * Does nothing if `panel` is not open.
   */
  hide(panel: Panel): void;

  /**
   * Closes `panel`, unless what it shows refuses, e.g. to keep unsaved changes.
   *
   * Returns false if the panel stays open.
   */
  close(panel: Panel): Promise<boolean>;
}

/**
 * A source of custom panels.
 */
export interface CustomPanelSource {
  /**
   * The source's id, namespaced by the plugin's, e.g. `example/report`. Omitted if the id already exists.
   */
  readonly id: CustomPanel['type'];

  /**
   * The source's name, shown in menus, e.g. `Report`.
   */
  readonly label: string;

  /**
   * Whether its panels sit among a group's tabs. A panel that does not is always alone in its group.
   */
  readonly tab: boolean;

  /**
   * Whether its panels can be closed.
   */
  readonly closable: boolean;

  /**
   * The panel's header, e.g. its icon and title, in the tab bar and overflow menu.
   */
  readonly header: ComponentType<CustomPanelProps>;

  /**
   * The panel.
   */
  readonly panel: ComponentType<CustomPanelProps>;

  /**
   * Called before `panel` closes. Returns false if the panel stays open.
   *
   * It is not called when the panel has to close, e.g. when its source is removed.
   *
   * Throwing an error keeps the panel open.
   */
  close?(application: Application, dock: Dock, panel: CustomPanel): boolean | Promise<boolean>;
}

/**
 * The props of the components that show a custom panel.
 */
export interface CustomPanelProps {
  readonly application: Application;

  /**
   * The dock that the panel is in.
   */
  readonly dock: Dock;

  readonly panel: CustomPanel;
}
