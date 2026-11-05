import { createDialogHandle } from '@elsewise/components/components/dialog';
import type { Disposable, ProjectId, WorkspaceId } from '@elsewise/frontend-plugin';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';

/**
 * The state of the sidebar's projects and workspaces that commands change, e.g. which one is renamed in its row.
 */
export class SidebarStore {
  readonly projectDeleteDialog = createDialogHandle<ProjectId>();
  readonly workspaceDeleteDialog = createDialogHandle<WorkspaceId>();
  private readonly listeners = new Set<() => void>();
  private readonly currentCreating = new Set<string>();
  private currentRenaming: ProjectId | WorkspaceId | null = null;

  /**
   * Returns whether a workspace is being created in `project`.
   */
  creating(project: ProjectId): boolean {
    return this.currentCreating.has(`${project.daemon}/${project.project}`);
  }

  setCreating(project: ProjectId, creating: boolean): void {
    const key = `${project.daemon}/${project.project}`;
    if (creating) {
      this.currentCreating.add(key);
    } else {
      this.currentCreating.delete(key);
    }
    this.notify();
  }

  /**
   * The project or workspace whose name is edited in its row, or null.
   */
  get renaming(): ProjectId | WorkspaceId | null {
    return this.currentRenaming;
  }

  set renaming(id: ProjectId | WorkspaceId | null) {
    this.currentRenaming = id;
    this.notify();
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * Returns whether a workspace is being created in `project`.
 */
export function useCreating(project: ProjectId): boolean {
  const { sidebar } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => sidebar.subscribe(listener), [sidebar]);
  return useSyncExternalStore(subscribe, () => sidebar.creating(project));
}

/**
 * Returns whether the name of the project or workspace with `id` is edited in its row.
 */
export function useRenaming(id: ProjectId | WorkspaceId): boolean {
  const { sidebar } = useApplicationManager();
  const subscribe = useCallback((listener: () => void) => sidebar.subscribe(listener), [sidebar]);
  return useSyncExternalStore(subscribe, () => {
    const renaming = sidebar.renaming;
    return (
      renaming !== null &&
      renaming.daemon === id.daemon &&
      renaming.project === id.project &&
      ('workspace' in renaming ? renaming.workspace : null) === ('workspace' in id ? id.workspace : null)
    );
  });
}
