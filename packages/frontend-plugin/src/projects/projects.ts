import type { Disposable } from '@elsewise/plugin';
import type { ContextMenuGroup } from '../context-menu';
import type { RepositorySource } from './repositories';
import type { ProjectIcon, ProjectSidebarItem } from './sidebar';
import type { Workspaces } from './workspaces';

/**
 * The projects across daemons.
 */
export interface Projects {
  /**
   * The projects' workspaces.
   */
  readonly workspaces: Workspaces;

  /**
   * Returns the projects on the daemon with `daemonId`.
   */
  list(daemonId: string): Promise<readonly Project[]>;

  /**
   * Adds a project on the daemon with `daemonId`.
   */
  add(daemonId: string, project: NewProject | ExistingProject): Promise<Project>;

  /**
   * Clones a new project from `clone.url` on the daemon with `daemonId`.
   *
   * Calls `onProgress` as the clone advances. Aborting `signal` stops the clone, removes the folder and rejects.
   */
  clone(
    daemonId: string,
    clone: ProjectClone,
    options?: { onProgress?: (progress: CloneProgress) => void; signal?: AbortSignal },
  ): Promise<Project>;

  /**
   * Renames `project`.
   */
  rename(project: ProjectId, name: string): Promise<Project>;

  /**
   * Deletes `project` and its workspaces, closing whatever is open in them first. The daemon stops tracking them, and
   * `deleteFiles` deletes their folders.
   */
  delete(project: ProjectId, options?: { deleteFiles?: boolean }): Promise<void>;

  /**
   * Adds `icons` to each project's sidebar row, in place of its default icon.
   *
   * ```ts
   * projects.addIcons([{ id: 'io.example.github', component: GitHubIcon }]);
   * ```
   *
   * Returns a disposable that removes the `icons`.
   */
  addIcons(icons: readonly ProjectIcon[]): Disposable;

  /**
   * Adds `items` to each project's sidebar row, between its name and its chevron.
   *
   * ```ts
   * projects.addSidebarItems([{ id: 'io.example.ci', component: CiStatus }]);
   * ```
   *
   * Returns a disposable that removes the `items`.
   */
  addSidebarItems(items: readonly ProjectSidebarItem[]): Disposable;

  /**
   * Adds `groups`, and their items, to each project's context menu.
   *
   * See {@link ContextMenuGroup} for adding to a built-in group or submenu.
   *
   * Returns a disposable that removes the `groups`.
   */
  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable;

  /**
   * Adds `sources` from which the 'New project' dialog finds cloneable git repositories.
   *
   * ```ts
   * projects.addRepositorySources([
   *   async (query, { signal }) => [
   *     { id: 'io.example.github.pante', order: 10, label: 'GitHub · Pante', items: await search(query, signal) },
   *   ],
   * ]);
   * ```
   *
   * See {@link RepositoryGroup} for merging groups.
   *
   * Returns a disposable that removes the `sources`.
   */
  addRepositorySources(sources: readonly RepositorySource[]): Disposable;
}

/**
 * A project's id.
 */
export interface ProjectId {
  readonly daemon: string;
  readonly project: string;
}

/**
 * A project.
 */
export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  /**
   * `missing` if the folder is gone, `broken` if it is there but no longer a project.
   */
  readonly state: 'ok' | 'missing' | 'broken';

  /**
   * The main workspace's path.
   */
  readonly absolutePath: string;
}

/**
 * A new, empty project the daemon creates.
 */
export interface NewProject {
  readonly type: 'new';
  readonly name: string;

  /**
   * Defaults to a folder named after `name` in the daemon's projects directory.
   */
  readonly absolutePath?: string;
}

/**
 * A folder on the daemon's machine, which no project has yet.
 */
export interface ExistingProject {
  readonly type: 'existing';

  /**
   * Defaults to the folder's name.
   */
  readonly name?: string;

  readonly absolutePath: string;
}

/**
 * A project to clone.
 */
export interface ProjectClone {
  readonly url: string;

  /**
   * Defaults to the folder's name.
   */
  readonly name?: string;

  /**
   * Defaults to a folder in the daemon's projects directory.
   */
  readonly absolutePath?: string;
}

/**
 * A git clone's progress.
 */
export interface CloneProgress {
  readonly phase:
    | 'enumerating'
    | 'counting'
    | 'compressing'
    | 'receiving'
    | 'resolving'
    | 'unpacking'
    | 'checking-out'
    | 'other';

  /**
   * How much of the phase is done, from 0 to 100.
   */
  readonly percent: number;
}
