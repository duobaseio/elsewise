import type { Application } from '../plugin';
import type { Project } from './projects';

/**
 * The built-in project source groups and sources.
 *
 * See {@link ProjectSourceGroup}.
 */
export const DEFAULT_PROJECT_SOURCE_GROUPS = {
  add: {
    id: 'io.duobase.elsewise.project.sources.add',
    order: 10,
    sources: {
      new: { id: 'elsewise.project.source.new', order: 10 },
      import: { id: 'elsewise.project.source.import', order: 20 },
    },
  },
} as const;

/**
 * A group of sources, separated from other groups in menus.
 *
 * Groups with the same id are merged. `order` uses the first defined value.
 */
export interface ProjectSourceGroup {
  /**
   * The id of this group, e.g. `DEFAULT_PROJECT_SOURCE_GROUPS.add.id`.
   *
   * See {@link DEFAULT_PROJECT_SOURCE_GROUPS} for the built-in groups.
   */
  readonly id: string;

  /**
   * The order of this group in menus, shown lowest first and by id when equal. Groups without one are shown last.
   *
   * A differing order added later is ignored.
   */
  readonly order?: number;

  /**
   * The sources in this group. A source whose id already exists in any group is ignored.
   */
  readonly sources: readonly ProjectSource[];
}

/**
 * A source from which a project can be added to a daemon, e.g. a new or existing folder.
 */
export interface ProjectSource {
  /**
   * The source's id, namespaced by the plugin's, e.g. `io.example.github`.
   */
  readonly id: string;

  /**
   * The order of this source in its group, shown lowest first and by label when equal. Sources without one are shown
   * last.
   */
  readonly order?: number;

  /**
   * The label shown in menus, e.g. `Import project…`.
   */
  readonly label: string;

  /**
   * Returns whether the source is shown in menus for the daemon with `daemonId`. Defaults to true.
   */
  shown?(application: Application, daemonId: string): boolean;

  /**
   * Returns whether the source can add a project to the daemon with `daemonId`. Defaults to true.
   *
   * A disabled source is greyed out in menus. A source is also disabled while it adds a project.
   */
  enabled?(application: Application, daemonId: string): boolean;

  /**
   * Adds a project to the daemon with `daemonId`, or returns null if none was added, e.g. when canceled or failed. It
   * reports its own errors.
   *
   * The project's main workspace is opened once it is added.
   */
  // TODO: Let sources ask for input in a dialog once the plugin API can open one.
  // TODO: Report errors through the plugin API once plugins can show toasts.
  add(application: Application, daemonId: string): Promise<Project | null>;
}
