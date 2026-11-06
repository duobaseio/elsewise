import { queryOptions } from '@tanstack/react-query';
import { daemonQuery } from '@/daemon';

/**
 * Returns the query for the branches, tags and worktrees of the repository at `absolutePath` on the daemon with
 * `daemonId`.
 */
export function refsQuery(daemonId: string, absolutePath: string) {
  return queryOptions({
    queryKey: ['daemons', daemonId, 'git', absolutePath, 'refs'],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(daemonId));
      const [branches, tags, worktrees] = await Promise.all([
        daemon.git.getBranches({ absolutePath }),
        daemon.git.getTags({ absolutePath }),
        daemon.git.getWorktrees({ absolutePath }),
      ]);
      return { branches: branches.branches, tags: tags.tags, worktrees: worktrees.worktrees };
    },
    enabled: absolutePath !== '',
  });
}
