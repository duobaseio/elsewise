import { createDialogHandle } from '@elsewise/components/components/dialog';
import type {
  ContextMenuGroup,
  Disposable,
  FileTree,
  FileTreeSelection,
  Workspace,
  WorkspaceId,
} from '@elsewise/frontend-plugin';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { ContextMenuManager } from '@/command/context-menu/context-menu-manager';
import { DEFAULT_CONTEXT_MENU } from '@/fs/default-context-menu';
import type { PasteEntry } from '@/fs/paste';
import { sameWorkspace } from '@/projects/workspace-manager';

export interface FileTreeClipboard {
  readonly cut: boolean;
  readonly workspace: WorkspaceId;
  readonly paths: readonly string[];
}

/**
 * The file tree as plugins see it.
 */
export class FileTreeManager implements FileTree {
  readonly newDialog = createDialogHandle<{
    readonly workspace: Workspace;
    readonly folder: string;
    readonly kind: 'file' | 'folder';
    readonly name?: string;
  }>();
  readonly deleteDialog = createDialogHandle<FileTreeSelection>();
  readonly pasteDialog = createDialogHandle<{
    readonly workspace: Workspace;
    readonly folder: string;
    readonly clipboard: FileTreeClipboard;
  }>();
  readonly overwriteDialog = createDialogHandle<{
    readonly workspace: Workspace;
    readonly folder: string;
    readonly cut: boolean;
    readonly entries: readonly PasteEntry[];
  }>();

  private readonly listeners = new Set<() => void>();
  private readonly contextMenus = new ContextMenuManager(DEFAULT_CONTEXT_MENU, () => this.notify());
  private currentClipboard: FileTreeClipboard | null = null;
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
   * The paths that were cut or copied, which a paste moves or copies.
   */
  get clipboard(): FileTreeClipboard | null {
    return this.currentClipboard;
  }

  set clipboard(clipboard: FileTreeClipboard | null) {
    this.currentClipboard = clipboard;
    this.notify();
  }

  /**
   * Points the clipboard's paths at or under `source` in `workspace` to `destination`.
   */
  moveClipboardPaths(workspace: WorkspaceId, source: string, destination: string) {
    const clipboard = this.currentClipboard;
    if (clipboard === null || !sameWorkspace(clipboard.workspace, workspace)) {
      return;
    }

    const paths = clipboard.paths.map((path) =>
      path === source || (source.endsWith('/') && path.startsWith(source))
        ? destination + path.slice(source.length)
        : path,
    );
    this.clipboard = { ...clipboard, paths };
  }

  /**
   * Deletes the clipboard's paths at or under `path` in `workspace`, and clears it once none are left.
   */
  deleteClipboardPaths(workspace: WorkspaceId, path: string) {
    const clipboard = this.currentClipboard;
    if (clipboard === null || !sameWorkspace(clipboard.workspace, workspace)) {
      return;
    }

    const paths = clipboard.paths.filter((other) => other !== path && !(path.endsWith('/') && other.startsWith(path)));
    this.clipboard = paths.length === 0 ? null : { ...clipboard, paths };
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
