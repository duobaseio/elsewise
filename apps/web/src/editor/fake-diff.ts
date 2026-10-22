import { DEFAULT_DIFF_SOURCES, type EditorDiffSource } from '@elsewise/plugin';

// TODO: Replace with the git sources once the daemon reads files at a revision, and take the file from `base` once it
// has a parameter for it. Until then, the sources read the one file the editor shows from the dev server.
const PATH = 'apps/web/src/routes/_shell/$project/$worktree.tsx';

export const FAKE_UNSTAGED: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.unstaged,
  label: 'Unstaged',
  base: () => show('index'),
};

export const FAKE_UNCOMMITTED: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.uncommitted,
  label: 'Uncommitted',
  base: () => show('head'),
};

export const FAKE_BRANCH: EditorDiffSource = {
  id: DEFAULT_DIFF_SOURCES.branch,
  label: 'Branch',
  base: () => show('branch'),
};

// Returns the file as it is in `base`, or null if it does not exist there.
async function show(base: 'index' | 'head' | 'branch'): Promise<string | null> {
  const response = await fetch(`/@elsewise/git/show?${new URLSearchParams({ base, path: PATH })}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Reading the file from git failed with ${response.status}`);
  }
  return response.text();
}
