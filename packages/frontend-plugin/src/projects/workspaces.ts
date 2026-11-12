import type { Disposable } from '@elsewise/plugin';
import type { ContextMenuGroup } from '../context-menu';
import type { ProjectId } from './projects';
import type { WorkspaceSidebarItem } from './sidebar';

/**
 * A status added to a workspace. See {@link Workspaces.addStatus}.
 */
export type WorkspaceStatus = 'idle' | 'running' | 'complete';

/**
 * The status of a workspace, from the statuses added to it. See {@link Workspaces.status}.
 */
export type WorkspaceAggregateStatus = 'idle' | 'running' | 'partial' | 'complete';

/**
 * The workspaces of every project.
 */
export interface Workspaces {
  /**
   * The workspace shown, or null on a page without one, e.g. the settings.
   */
  readonly active: Workspace | null;

  /**
   * Returns the workspaces of `project`, the main one first.
   */
  list(project: ProjectId): Promise<readonly Workspace[]>;

  /**
   * Adds a workspace to `project`.
   */
  add(project: ProjectId, workspace: NewWorkspace | ExistingWorkspace): Promise<Workspace>;

  /**
   * Renames `workspace`.
   */
  rename(workspace: WorkspaceId, name: string): Promise<Workspace>;

  /**
   * Deletes `workspace`, closing whatever is open in it first. The daemon stops tracking the worktree, `deleteFiles`
   * removes it from the repository and disk, and `deleteBranch` deletes its branch.
   *
   * Throws an error if called with main workspace.
   */
  delete(
    workspace: WorkspaceId,
    options?: { deleteFiles?: false; deleteBranch?: false } | { deleteFiles: true; deleteBranch?: boolean },
  ): Promise<void>;

  /**
   * Returns the aggregate status of `workspace`, from the statuses added to it:
   * * `idle`: none are running or complete.
   * * `running`: some are running, and none are complete.
   * * `partial`: some are running, and some are complete.
   * * `complete`: none are running, and some are complete.
   *
   * A status that completes is reset to idle when the workspace is shown.
   */
  status(workspace: WorkspaceId): WorkspaceAggregateStatus;

  /**
   * Adds a status to `workspace`, initially `status`, e.g. an agent session's.
   *
   * A workspace aggregates multiple statuses.
   *
   * ```ts
   * const status = app.projects.workspaces.addStatus(workspace.id, 'running');
   * status.set('complete');
   * ```
   */
  addStatus(workspace: WorkspaceId, status: WorkspaceStatus): WorkspaceStatusHandle;

  /**
   * Resets the complete statuses of `workspace` to idle. Does nothing otherwise.
   */
  resetStatus(workspace: WorkspaceId): void;

  /**
   * Adds `items` to each workspace's sidebar row, between its name and its delete button.
   *
   * ```ts
   * workspaces.addSidebarItems([{ id: 'io.example.pull-request', component: PullRequest }]);
   * ```
   *
   * Returns a disposable that removes the `items`.
   */
  addSidebarItems(items: readonly WorkspaceSidebarItem[]): Disposable;

  /**
   * Adds `groups`, and their items, to each workspace's context menu.
   *
   * See {@link ContextMenuGroup} for adding to a built-in group or submenu.
   *
   * Returns a disposable that removes the `groups`.
   */
  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable;
}

/**
 * The id of a workspace.
 */
export interface WorkspaceId extends ProjectId {
  readonly workspace: string;
}

/**
 * A workspace.
 */
export interface Workspace {
  readonly id: WorkspaceId;

  readonly name: string;

  /**
   * `missing` if the folder is gone, `detached` if a commit is checked out rather than a branch, `broken` if it is no
   * longer a worktree of the repository.
   */
  readonly state: 'ok' | 'missing' | 'detached' | 'broken';

  /**
   * Whether this is the repository's main worktree.
   */
  readonly main: boolean;

  readonly absolutePath: string;
}

/**
 * A new worktree the daemon adds to the repository.
 */
export interface NewWorkspace {
  readonly type: 'new';

  /**
   * Defaults to a generated name.
   */
  readonly name?: string;

  /**
   * The branch to check out, created from `base` if it does not exist. Defaults to one named after `name`.
   */
  readonly branch?: string;

  /**
   * The commit-ish a new `branch` starts from. Defaults to HEAD.
   */
  readonly base?: string;
}

/**
 * A linked worktree of the repository already on the daemon's machine, which no workspace has yet.
 */
export interface ExistingWorkspace {
  readonly type: 'existing';

  /**
   * Defaults to the folder's name.
   */
  readonly name?: string;

  /**
   * The worktree's path.
   */
  readonly absolutePath: string;
}

/**
 * A status a plugin added to a workspace.
 */
export interface WorkspaceStatusHandle {
  set(status: WorkspaceStatus): void;

  /**
   * Removes the status.
   */
  dispose(): void;
}
