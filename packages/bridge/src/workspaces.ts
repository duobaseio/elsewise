import type { ProjectId, WorkspaceId } from '@elsewise/frontend-plugin';
import * as z from 'zod';

export type WorkspaceState = z.infer<typeof WorkspaceState>;

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = { dock: null, fileTree: { expanded: [], selected: [] } };

/**
 * The persisted workspace's settings.
 */
export interface WorkspacesBridge {
  /**
   * Returns the persisted state of `workspace`.
   *
   * A missing or invalid value is replaced with its default.
   */
  load(workspace: WorkspaceId): Promise<WorkspaceState>;

  /**
   * Replaces the persisted state of `workspace`.
   *
   * Throws an error if `workspace` is not a workspace's id or `state` is not an object.
   */
  save(workspace: WorkspaceId, state: WorkspaceState): Promise<void>;

  /**
   * Deletes the persisted state of `id`, a workspace, or of every workspace in `id`, a project.
   *
   * Throws an error if `id` is neither a workspace's nor a project's id.
   */
  delete(id: ProjectId | WorkspaceId): Promise<void>;
}

/**
 * A workspace's persisted state.
 */
export const WorkspaceState = z.object({
  /**
   * The serialized dockview.
   */
  dock: z.unknown().default(null),
  fileTree: z
    .object({
      /**
       * The open folders, each ending with `/`.
       */
      expanded: z.array(z.string()).catch([]),
      /**
       * The selected folders, each ending with `/`.
       */
      selected: z.array(z.string()).catch([]),
    })
    .catch({ expanded: [], selected: [] }),
});
