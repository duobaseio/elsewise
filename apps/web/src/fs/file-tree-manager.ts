import { createDialogHandle } from '@elsewise/components/components/dialog';
import type { ContextMenuGroup, Disposable, FileTree, FileTreeSelection, WorkspaceId } from '@elsewise/frontend-plugin';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { ContextMenuManager } from '@/command/context-menu/context-menu-manager';
import { DEFAULT_CONTEXT_MENU } from '@/fs/default-context-menu';

/**
 * The file tree as plugins see it.
 */
export class FileTreeManager implements FileTree {
  readonly deleteDialog = createDialogHandle<FileTreeSelection>();

  private readonly listeners = new Set<() => void>();
  private readonly contextMenus = new ContextMenuManager(DEFAULT_CONTEXT_MENU, () => this.notify());
  private currentRenaming: { readonly workspace: WorkspaceId; readonly path: string } | null = null;

  /**
   * The context menu's deduplicated groups, in order of first addition.
   */
  get contextMenu(): readonly ContextMenuGroup[] {
    return this.contextMenus.groups;
  }

  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable {
    return this.contextMenus.add(groups);
  }

  /**
   * The path whose name is edited in its workspace's file tree.
   */
  get renaming(): { readonly workspace: WorkspaceId; readonly path: string } | null {
    return this.currentRenaming;
  }

  set renaming(renaming: { readonly workspace: WorkspaceId; readonly path: string } | null) {
    this.currentRenaming = renaming;
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
      try {
        listener();
      } catch (error) {
        console.error('File tree listener failed', error);
      }
    }
  }
}

export function useFileTreeManager(): FileTreeManager;
export function useFileTreeManager<T>(select: (fileTree: FileTreeManager) => T): T;
export function useFileTreeManager<T>(select?: (fileTree: FileTreeManager) => T): FileTreeManager | T {
  const fileTree = useApplicationManager().fileTree;
  const subscribe = useCallback((listener: () => void) => fileTree.subscribe(listener), [fileTree]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? fileTree : select(fileTree)));
}
