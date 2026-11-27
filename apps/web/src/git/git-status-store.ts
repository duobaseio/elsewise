import type { FileTreeGitStatus } from '@elsewise/components/components/file-tree';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import type { Client } from '@elsewise/transport';
import { KeyedMap } from '@/collections/keyed-map';
import { Change } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';

/**
 * The git statuses of the watched workspaces, by workspace and path.
 */
export class GitStatusStore {
  private readonly statuses = new KeyedMap<
    WorkspaceId,
    { readonly list: readonly FileTreeGitStatus[]; readonly byPath: ReadonlyMap<string, FileTreeGitStatus['status']> }
  >(({ daemon, project, workspace }) => [daemon, project, workspace]);
  private readonly changeListeners = new Set<() => void>();

  /**
   * Watches the git status of `workspace`, whose worktree is at `root`, and keeps it up to date.
   *
   * Returns a function that stops and forgets the status.
   */
  watch(git: Pick<Client<typeof GitService>, 'watchStatus'>, workspace: WorkspaceId, root: string): () => void {
    const abort = new AbortController();
    void (async () => {
      try {
        for await (const { status } of git.watchStatus(
          { absolutePath: root, includeIgnored: true },
          { signal: abort.signal },
        )) {
          const list: FileTreeGitStatus[] = [];
          for (const entry of status?.entries ?? []) {
            const { kind, relativePath, directory } = entry;
            const path = directory ? `${relativePath}/` : relativePath;

            switch (kind.case) {
              case 'changed': {
                const { staged, unstaged } = kind.value;
                const added = staged === Change.ADDED || unstaged === Change.ADDED;
                list.push({ path, status: added ? 'added' : 'modified' });
                break;
              }
              case 'untracked':
                list.push({ path, status: 'untracked' });
                break;
              case 'ignored':
                list.push({ path, status: 'ignored' });
                break;
              case 'conflicted':
                list.push({ path, status: 'conflict' });
                break;
            }
          }
          this.statuses.set(workspace, { list, byPath: new Map(list.map(({ path, status }) => [path, status])) });
          this.notify();
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error(`Watching the git status of ${root} failed`, error);
        }
      }
    })();
    return () => {
      abort.abort();
      if (this.statuses.delete(workspace)) {
        this.notify();
      }
    };
  }

  /**
   * Returns the statuses of `workspace`, empty if it is not watched or has none yet.
   */
  list(workspace: WorkspaceId): readonly FileTreeGitStatus[] {
    return this.statuses.get(workspace)?.list ?? [];
  }

  /**
   * Returns the status of the file or folder at `path` in `workspace`, or null if it has none.
   *
   * Folder paths end with `/`.
   */
  get(workspace: WorkspaceId, path: string): FileTreeGitStatus['status'] | null {
    return this.statuses.get(workspace)?.byPath.get(path) ?? null;
  }

  /**
   * Calls `listener` whenever a status changes.
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
