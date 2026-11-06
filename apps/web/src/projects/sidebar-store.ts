import { createDialogHandle } from '@elsewise/components/components/dialog';
import type { Disposable, ProjectId, WorkspaceId } from '@elsewise/frontend-plugin';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';

export interface NewProjectDraft {
  readonly daemon: string;
}

export interface NewWorkspaceDraft {
  readonly project: ProjectId;
  readonly name?: string;
}

export interface ImportWorkspaceDraft {
  readonly project: ProjectId;
  readonly name?: string;
  readonly absolutePath?: string;
}

/**
 * The state of the sidebar's projects and workspaces that commands change, e.g. which one is renamed in its row.
 */
export class SidebarStore {
  readonly newProjectDialog = createDialogHandle<NewProjectDraft>();
  readonly deleteProjectDialog = createDialogHandle<ProjectId>();
  readonly newWorkspaceDialog = createDialogHandle<NewWorkspaceDraft>();
  readonly importWorkspaceDialog = createDialogHandle<ImportWorkspaceDraft>();
  readonly deleteWorkspaceDialog = createDialogHandle<WorkspaceId>();
  private readonly listeners = new Set<() => void>();
  private currentRenaming: ProjectId | WorkspaceId | null = null;

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
