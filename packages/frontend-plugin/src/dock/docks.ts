import type { Workspace } from '../projects/workspaces';
import type { TerminalOptions } from '../terminal';
import type { Group, Layout } from './layout';
import type { ClosablePanel, EditorPanel, Panel, TablessPanel, TabPanel, TerminalPanel } from './panels';
import type { GroupPlacement, Placement } from './placement';

/**
 * The docks, one for each workspace.
 */
export interface Docks {
  /**
   * The dock of the workspace shown, or null on a page without one, e.g. the settings.
   */
  readonly active: Dock | null;
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
  readonly activeTabPanel: TabPanel | null;

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
   * The panel is shown, and becomes the active panel unless `activate` is false. `activate` defaults to true.
   *
   * If the file is already open, `placement` is ignored.
   *
   * Returns the panel, or null if the panel that `placement` refers to is not open.
   */
  addEditor(relativePath: string, placement: Placement, activate?: boolean): EditorPanel | null;

  /**
   * Adds a terminal, and a panel that shows it.
   *
   * The panel is shown, and becomes the active panel unless `activate` is false. `activate` defaults to true.
   *
   * Returns the panel, or null if the panel that `placement` refers to is not open.
   */
  addTerminal(options: TerminalOptions, placement: Placement, activate?: boolean): Promise<TerminalPanel | null>;

  /**
   * Moves `panel` to `placement`.
   *
   * The panel is shown, and becomes the active panel.
   *
   * Does nothing if `panel`, or the panel that `placement` refers to, is not open.
   */
  move(panel: TabPanel, placement: Placement): void;
  move(panel: TablessPanel, placement: GroupPlacement): void;

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
  close(panel: ClosablePanel): Promise<boolean>;
}
