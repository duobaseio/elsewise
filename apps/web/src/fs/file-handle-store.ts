import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { KeyedMap } from '@/collections/keyed-map';
import type { FileHandle } from './file-handle';

/**
 * The handles of the open files, by workspace and path.
 */
export class FileHandleStore {
  private readonly handles = new KeyedMap<readonly [WorkspaceId, string], FileHandle>(
    ([{ daemon, project, workspace }, relativePath]) => [daemon, project, workspace, relativePath],
  );
  private readonly changeListeners = new Set<() => void>();

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
