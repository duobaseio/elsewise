import { DEFAULT_DIFF_SOURCE_GROUPS, type EditorDiffSourceGroup } from '@elsewise/frontend-plugin';

// TODO: Replace with the git sources once the daemon reads files at a revision, and take the file from `base` once it
// has a parameter for it. Until then, the sources read the one file the editor shows from the dev server.
const PATH = 'apps/web/src/routes/_shell/$daemon/$project/$workspace.tsx';

const { git } = DEFAULT_DIFF_SOURCE_GROUPS;

export const FAKE_GIT: EditorDiffSourceGroup = {
  id: git.id,
  order: git.order,
  sources: [
    {
      id: git.sources.unstaged.id,
      order: git.sources.unstaged.order,
      label: 'Unstaged',
      base: async () => ({ code: (await show('index')).code, label: 'Staged' }),
    },
    {
      id: git.sources.uncommitted.id,
      order: git.sources.uncommitted.order,
      label: 'Uncommitted',
      base: async () => ({ code: (await show('head')).code, label: 'HEAD' }),
    },
    {
      id: git.sources.branch.id,
      order: git.sources.branch.order,
      label: 'Branch',
      base: async () => {
        const { code, branch } = await show('branch');
        return { code, label: branch ?? 'Merge base' };
      },
    },
  ],
};

// Returns the file as it is in `base`, or null if it does not exist there, and for `branch`, the branch `HEAD` branched
// off.
async function show(base: 'index' | 'head' | 'branch'): Promise<{ code: string | null; branch: string | null }> {
  const response = await fetch(`/@elsewise/git/show?${new URLSearchParams({ base, path: PATH })}`);
  const branch = response.headers.get('X-Elsewise-Branch');
  if (response.status === 404) {
    return { code: null, branch };
  }
  if (!response.ok) {
    throw new Error(`Reading the file from git failed with ${response.status}`);
  }
  return { code: await response.text(), branch };
}
