import { DEFAULT_DIFF_SOURCES, type EditorDiffSource } from '@elsewise/plugin';

// TODO: Replace with the git sources once the daemon reads files at a revision, and take the file from `base` once it
// has a parameter for it. Until then, the sources read the one file the editor shows from the dev server.
const PATH = 'apps/web/src/routes/_shell/$project/$worktree.tsx';

export const FAKE_UNSTAGED: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.unstaged,
  label: 'Unstaged',
  base: async () => ({ code: (await show('index')).code, label: 'Staged' }),
};

export const FAKE_UNCOMMITTED: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.uncommitted,
  label: 'Uncommitted',
  base: async () => ({ code: (await show('head')).code, label: 'HEAD' }),
};

export const FAKE_BRANCH: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.branch,
  label: 'Branch',
  base: async () => {
    const { code, branch } = await show('branch');
    return { code, label: branch ?? 'Merge base' };
  },
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
