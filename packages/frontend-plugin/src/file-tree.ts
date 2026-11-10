import type { Disposable } from '@elsewise/plugin';
import type { ContextMenuGroup } from './context-menu';
import type { Workspace } from './projects/workspaces';

/**
 * The file tree.
 */
export interface FileTree {
  /**
   * Adds `groups`, and their items, to the context menu.
   *
   * See {@link ContextMenuGroup} for adding to a built-in group or submenu.
   *
   * Returns a disposable that removes the `groups`.
   */
  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable;
}

/**
 * A file tree's selection, which file tree commands act on.
 */
export interface FileTreeSelection {
  /**
   * The workspace that the paths are in.
   */
  readonly workspace: Workspace;

  /**
   * The selected files and folders, relative to the workspace, e.g. `src/` and `src/main.rs`. Folders end with `/`.
   */
  readonly paths: readonly string[];
}
