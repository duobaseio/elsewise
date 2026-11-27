import { createDialogHandle } from '@elsewise/components/components/dialog';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import type { Client } from '@elsewise/transport';
import { KeyedMap } from '@/collections/keyed-map';
import type { FileSystemService } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { sameWorkspace } from '@/projects/workspace-manager';
import { FileHandle } from './file-handle';

/**
 * A file that could not be saved before its panel closes.
 */
export interface CloseFileRequest {
  readonly file: FileHandle;
  /**
   * Why saving failed, or null if the file changed on disk.
   */
  readonly failure: string | null;
}

/**
 * The handles of the open files, by workspace and path.
 */
export class FileHandleStore {
  /**
   * Asks what to do with a file that could not be saved before its panel closes.
   */
  readonly closeDialog = createDialogHandle<CloseFileRequest>();
  private resolveCloseDialog: ((action: 'overwrite' | 'discard' | 'cancel') => void) | null = null;
  private readonly handles = new KeyedMap<readonly [WorkspaceId, string], FileHandle>(
    ([{ daemon, project, workspace }, relativePath]) => [daemon, project, workspace, relativePath],
  );
  private readonly references = new Map<FileHandle, number>();
  private readonly changeListeners = new Set<() => void>();

  /**
   * Opens the close dialog for `file`.
   *
   * If the dialog is already open for another file, that one is closed with `cancel` first.
   */
  openCloseDialog(file: FileHandle, failure: string | null): Promise<'overwrite' | 'discard' | 'cancel'> {
    this.resolveCloseDialog?.('cancel');
    return new Promise((resolve) => {
      this.resolveCloseDialog = resolve;
      this.closeDialog.openWithPayload({ file, failure });
    });
  }

  /**
   * Closes the close dialog with `action`. Does nothing if it is not open.
   */
  closeCloseDialog(action: 'overwrite' | 'discard' | 'cancel') {
    const resolve = this.resolveCloseDialog;
    if (resolve === null) {
      return;
    }

    this.resolveCloseDialog = null;
    resolve(action);
    this.closeDialog.close();
  }

  /**
   * Returns the handle of the file at `relativePath` in `workspace`, or null if the file is not open.
   */
  get(workspace: WorkspaceId, relativePath: string): FileHandle | null {
    return this.handles.get([workspace, relativePath]) ?? null;
  }

  /**
   * Returns the handle of the file at `relativePath` in `workspace` at `root`, creating it if it does not already exist.
   */
  open(workspace: WorkspaceId, fs: Client<typeof FileSystemService>, root: string, relativePath: string): FileHandle {
    let handle = this.get(workspace, relativePath);
    if (handle === null) {
      handle = new FileHandle(fs, root, relativePath);
      this.handles.set([workspace, relativePath], handle);
    }

    this.references.set(handle, (this.references.get(handle) ?? 0) + 1);
    this.notify();
    return handle;
  }

  /**
   * Closes `handle` in `workspace`, which is disposed after all references are released.
   */
  close(workspace: WorkspaceId, handle: FileHandle) {
    const references = (this.references.get(handle) ?? 0) - 1;
    if (references > 0) {
      this.references.set(handle, references);
      return;
    }

    this.references.delete(handle);
    handle.dispose();
    if (this.get(workspace, handle.relativePath) === handle) {
      this.handles.delete([workspace, handle.relativePath]);
    }
    this.notify();
  }

  /**
   * Points the handles at or under `source` in `workspace` to `destination`, replacing the conflicting handles at
   * the destination.
   */
  move(workspace: WorkspaceId, source: string, destination: string) {
    const moved = [...this.handles].filter(
      ([[other, path]]) =>
        sameWorkspace(other, workspace) && (path === source || (source.endsWith('/') && path.startsWith(source))),
    );

    for (const [key] of moved) {
      this.handles.delete(key);
    }

    for (const [[, path], handle] of moved) {
      const relativePath = destination + path.slice(source.length);
      this.handles.set([workspace, relativePath], handle);
      handle.move(relativePath);
    }

    if (moved.length > 0) {
      this.notify();
    }
  }

  /**
   * Calls `listener` whenever a handle is opened, closed or moved.
   *
   * To stop, call the returned function.
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }
}
