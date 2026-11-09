import type { MessageInitShape } from '@bufbuild/protobuf';
import type { FileTreeModel } from '@elsewise/components/components/file-tree';
import { toast } from '@elsewise/components/components/toast';
import type { BidiCall } from '@elsewise/transport';
import {
  DirectoryListing_Entry_Type,
  type WatchDirectoriesRequestSchema,
  type WatchDirectoriesResponse,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';

export type DirectoryWatcherModel = Pick<FileTreeModel, 'batch' | 'onExpansion' | 'resetPaths'>;

type Watcher = BidiCall<MessageInitShape<typeof WatchDirectoriesRequestSchema>, WatchDirectoriesResponse>;

/**
 * Syncs the daemon's file watcher and file tree component.
 */
export class DirectoryWatcher {
  private readonly root: string;
  private readonly model: DirectoryWatcherModel;
  private readonly watcher: Watcher;
  private readonly watched = new Set(['']);
  private readonly listings = new Map<string, Set<string>>();
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(root: string, model: DirectoryWatcherModel, watcher: Watcher) {
    this.root = root;
    this.model = model;
    this.watcher = watcher;
    this.model.resetPaths([]);
    this.unsubscribe = model.onExpansion((path, expanded) => {
      if (expanded) {
        this.watched.add(path.slice(0, -1));
      } else {
        this.watched.delete(path.slice(0, -1));
      }
      void this.watch();
    });

    void this.watch();
    void this.listen();
  }

  private async watch(): Promise<void> {
    try {
      await this.watcher.send({ root: this.root, relativePaths: [...this.watched] });
    } catch {
      // `listen` reports the stream's failure.
    }
  }

  private async listen(): Promise<void> {
    try {
      for await (const response of this.watcher.responses) {
        this.apply(response);
      }
    } catch (error) {
      if (!this.disposed) {
        toast.add({ type: 'error', title: 'Watching files failed', description: (error as Error).message });
      }
    }
  }

  private apply(response: WatchDirectoriesResponse): void {
    const directory = response.relativePath;
    if (response.state.case !== 'listing') {
      if (directory === '') {
        this.model.resetPaths([]);
        this.listings.clear();
      }

      return;
    }

    // TODO: Show that a folder has more children once the tree can show `truncated` and `skipped`.
    const prefix = directory === '' ? '' : `${directory}/`;
    const children = new Set(
      response.state.value.entries.map(
        ({ name, type }) => `${prefix}${name}${type === DirectoryListing_Entry_Type.DIRECTORY ? '/' : ''}`,
      ),
    );
    const previous = this.listings.get(directory) ?? new Set();
    this.listings.set(directory, children);

    const added = [...children].filter((path) => !previous.has(path));
    const removed = [...previous].filter((path) => !children.has(path));
    for (const path of removed.filter((path) => path.endsWith('/'))) {
      for (const listed of this.listings.keys()) {
        if (`${listed}/`.startsWith(path)) {
          this.listings.delete(listed);
        }
      }
    }

    if (added.length > 0 || removed.length > 0) {
      this.model.batch([
        ...added.map((path) => ({ type: 'add' as const, path })),
        ...removed.map((path) => ({ type: 'remove' as const, path, recursive: true })),
      ]);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.watcher.cancel();
  }
}
