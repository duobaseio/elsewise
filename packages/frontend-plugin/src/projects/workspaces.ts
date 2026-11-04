import type { ProjectId } from './projects';

/**
 * The status of a workspace. See {@link Workspaces.status}.
 */
export type WorkspaceStatus = 'idle' | 'running' | 'waiting' | 'finished';

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
  add(project: ProjectId, source: WorkspaceSource): Promise<Workspace>;

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
   * * `idle`: none is running, waiting or finished.
   * * `running`: one is running, and none needs the user.
   * * `waiting`: one needs the user.
   * * `finished`: none is running or waiting, and one finished since the workspace was last shown.
   */
  status(workspace: WorkspaceId): WorkspaceStatus;

  /**
   * Adds a status to `workspace`, initially `status`, e.g. an agent session's.
   *
   * A workspace aggregates multiple statuses.
   *
   * ```ts
   * const status = app.projects.workspaces.addStatus(workspace.id, 'running');
   * status.set('waiting');
   * status.set('finished');
   * ```
   */
  addStatus(workspace: WorkspaceId, status: WorkspaceStatus): WorkspaceStatusHandle;
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
 * Where a workspace's worktree comes from.
 */
export type WorkspaceSource = NewWorkspaceSource | ExistingWorkspaceSource;

/**
 * A new worktree the daemon adds to the repository.
 */
export interface NewWorkspaceSource {
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
export interface ExistingWorkspaceSource {
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
