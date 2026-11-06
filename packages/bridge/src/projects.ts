import * as z from 'zod';

export type ProjectLayout = z.infer<typeof ProjectLayout>;

/**
 * The layout before any project is moved or collapsed.
 */
export const DEFAULT_PROJECT_LAYOUT: ProjectLayout = { daemons: {} };

/**
 * The projects related settings.
 */
export interface ProjectsBridge {
  /**
   * Returns the persisted sidebar layout.
   *
   * A missing or invalid value is replaced with its default.
   */
  load(): Promise<ProjectLayout>;

  /**
   * Replaces the persisted sidebar layout.
   *
   * Throws an error if `layout` is not an object.
   */
  save(layout: ProjectLayout): Promise<void>;
}

/**
 * How the sidebar lays out each daemon's projects and their workspaces, all identified by the daemon's ids.
 *
 * A missing or invalid value is replaced with its default, and an unknown key is dropped.
 */
export const ProjectLayout = z.object({
  /**
   * Each daemon's layout, by daemon id.
   */
  daemons: z
    .record(
      z.string(),
      z.object({
        /**
         * The projects in the order they are shown. A project not listed follows them, in the daemon's order.
         */
        projects: z
          .array(
            z.object({
              id: z.string(),
              /**
               * Whether the project's workspaces are shown.
               */
              expanded: z.boolean().catch(true),
              /**
               * The project's workspaces in the order they are shown. A workspace not listed follows them, in the
               * daemon's order.
               */
              workspaces: z.array(z.string()).catch([]),
            }),
          )
          .catch([]),
      }),
    )
    .catch({}),
});
