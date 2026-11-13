import type { MessageInitShape } from '@bufbuild/protobuf';
import type { FileTreeModel } from '@elsewise/components/components/file-tree';
import { toast } from '@elsewise/components/components/toast';
import type { BidiCall } from '@elsewise/transport';
import picomatch from 'picomatch';
import {
  DirectoryListing_Entry_Type,
  type WatchDirectoriesRequestSchema,
  type WatchDirectoriesResponse,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';

export type DirectoryWatcherModel = Pick<
  FileTreeModel,
  'batch' | 'getItem' | 'getSelectedPaths' | 'onExpansion' | 'resetPaths'
>;

export interface DirectoryWatcherSnapshot {
  readonly expanded: readonly string[];
  readonly selected: readonly string[];
}

type Watcher = BidiCall<MessageInitShape<typeof WatchDirectoriesRequestSchema>, WatchDirectoriesResponse>;

/**
 * Syncs the daemon's file watcher and file tree component, leaving out the entries a hidden pattern matches.
 *
 * Daemon reports the directories without trailing `/`s while file tree component requires them.
 */
export class DirectoryWatcher {
  private readonly root: string;
  private readonly model: DirectoryWatcherModel;
  private readonly watcher: Watcher;
  private readonly watched: Set<string>;
  private readonly hidden: (path: string) => boolean;
  private readonly listings = new Map<string, Set<string> | null>();
  private pending: DirectoryWatcherSnapshot | undefined;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    root: string,
    model: DirectoryWatcherModel,
    watcher: Watcher,
    pending: DirectoryWatcherSnapshot,
    hidden: readonly string[],
  ) {
    this.root = root;
    this.model = model;
    this.watcher = watcher;
    this.watched = new Set(['', ...pending.expanded]);
    this.hidden = picomatch(
      hidden.flatMap((pattern) => {
        const glob = pattern.replace(/\/$/, '');
        const anchored = glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`;
        return pattern.endsWith('/') ? [`${anchored}/`] : [anchored, `${anchored}/`];
      }),
      { dot: true, nonegate: true },
    );
    this.pending = pending;
    this.model.resetPaths([]);
    this.unsubscribe = model.onExpansion((path, expanded) => {
      if (expanded === this.watched.has(path)) {
        return;
      }

      if (expanded) {
        this.watched.add(path);
      } else {
        this.watched.delete(path);
      }
      void this.watch();
    });

    void this.watch();
    void this.listen();
  }

  /**
   * The open folders and the selected paths.
   */
  snapshot(): DirectoryWatcherSnapshot {
    return {
      expanded: [...this.watched].filter((path) => path !== ''),
      selected: [...(this.pending?.selected ?? this.model.getSelectedPaths())],
    };
  }

  private async watch(): Promise<void> {
    try {
      await this.watcher.send({ root: this.root, relativePaths: [...this.watched].map((path) => path.slice(0, -1)) });
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

  // TODO: Show that a folder has more children once the tree can show `truncated` and `skipped`.
  private apply(response: WatchDirectoriesResponse): void {
    const directory = response.relativePath === '' ? '' : `${response.relativePath}/`;
    if (!this.watched.has(directory)) {
      return;
    }

    const children =
      response.state.case === 'listing'
        ? new Set(
            response.state.value.entries
              .map(
                ({ name, type }) => `${directory}${name}${type === DirectoryListing_Entry_Type.DIRECTORY ? '/' : ''}`,
              )
              .filter((path) => !this.hidden(path)),
          )
        : null;

    if (this.pending !== undefined) {
      this.listings.set(directory, children);
      if (this.listings.get('') !== null && [...this.watched].every((watched) => this.listings.has(watched))) {
        const pending = this.pending;
        this.pending = undefined;
        this.restore(pending);
      }

      return;
    }

    if (children === null) {
      if (directory === '') {
        this.model.resetPaths([]);
        this.listings.clear();
      }
      return;
    }

    const previous = this.listings.get(directory) ?? new Set();
    this.listings.set(directory, children);

    const added = [...children].filter((path) => !previous.has(path));
    const removed = [...previous].filter((path) => !children.has(path));
    for (const path of removed.filter((path) => path.endsWith('/'))) {
      for (const listed of this.listings.keys()) {
        if (listed.startsWith(path)) {
          this.listings.delete(listed);
        }
      }
    }

    // Changes originating from the file tree immediately updates the file tree's model. We filter those changes out to
    // avoid batch(...) throwing errors on those.
    const adds = added.filter((path) => this.model.getItem(path) === null);
    const removes = removed.filter((path) => this.model.getItem(path) !== null);

    if (adds.length > 0 || removes.length > 0) {
      this.model.batch([
        ...adds.map((path) => ({ type: 'add' as const, path })),
        ...removes.map((path) => ({ type: 'remove' as const, path, recursive: true })),
      ]);
    }
  }

  private restore(pending: DirectoryWatcherSnapshot): void {
    const paths: string[] = [];
    const expanded = [''];
    for (const directory of expanded) {
      for (const path of this.listings.get(directory) ?? []) {
        paths.push(path);
        if (this.watched.has(path)) {
          expanded.push(path);
        }
      }
    }

    const gone = [...this.watched].filter((directory) => {
      const parent = this.listings.get(directory.slice(0, directory.slice(0, -1).lastIndexOf('/') + 1));
      return directory !== '' && parent !== null && !parent?.has(directory);
    });
    for (const directory of gone) {
      this.watched.delete(directory);
      this.listings.delete(directory);
    }
    if (gone.length > 0) {
      void this.watch();
    }

    this.model.resetPaths(paths, { initialExpandedPaths: expanded.slice(1) });
    for (const path of pending.selected) {
      this.model.getItem(path)?.select();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.watcher.cancel();
  }
}
