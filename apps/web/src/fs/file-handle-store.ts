import { createDialogHandle } from '@elsewise/components/components/dialog';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { KeyedMap } from '@/collections/keyed-map';
import type { FileHandle } from './file-handle';

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
   * Adds the handle of a file in `workspace`, in place of another of the same file.
   *
   * To remove it, call the returned function.
   */
  add(workspace: WorkspaceId, handle: FileHandle): () => void {
    this.handles.set([workspace, handle.relativePath], handle);
    this.notify();
    return () => {
      if (this.get(workspace, handle.relativePath) === handle) {
        this.handles.delete([workspace, handle.relativePath]);
        this.notify();
      }
    };
  }

  /**
   * Calls `listener` whenever a handle is added or removed.
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
