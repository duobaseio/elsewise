import type { FileTreeGitStatus } from '@elsewise/components/components/file-tree';
import type { Client } from '@elsewise/transport';
import { Change } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';

/**
 * Shows the git status of the worktree at `root` on a file tree, and keeps it up to date.
 *
 * Returns a function that stops.
 */
export function watchGitStatus(
  git: Pick<Client<typeof GitService>, 'watchStatus'>,
  root: string,
  model: { setGitStatus(statuses: readonly FileTreeGitStatus[]): void },
): () => void {
  const abort = new AbortController();
  void (async () => {
    try {
      for await (const { status } of git.watchStatus(
        { absolutePath: root, includeIgnored: true },
        { signal: abort.signal },
      )) {
        const statuses: FileTreeGitStatus[] = [];
        for (const entry of status?.entries ?? []) {
          const { kind, relativePath, directory } = entry;
          const path = directory ? `${relativePath}/` : relativePath;

          switch (kind.case) {
            case 'changed': {
              const { staged, unstaged } = kind.value;
              const added = staged === Change.ADDED || unstaged === Change.ADDED;
              statuses.push({ path, status: added ? 'added' : 'modified' });
              break;
            }
            case 'untracked':
              statuses.push({ path, status: 'untracked' });
              break;
            case 'ignored':
              statuses.push({ path, status: 'ignored' });
              break;
            case 'conflicted':
              statuses.push({ path, status: 'conflict' });
              break;
          }
        }
        model.setGitStatus(statuses);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error(`Watching the git status of ${root} failed`, error);
      }
    }
  })();
  return () => abort.abort();
}
