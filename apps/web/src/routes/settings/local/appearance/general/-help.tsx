import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import type { ReactNode } from 'react';
import { HelpIllustration } from '../-help-illustration';

/**
 * Shows the git status badges of a worktree's files in the file tree.
 */
export function GitStatusBadgesHelp({ children }: { children: ReactNode }) {
  const model = useFileTree({
    initialPaths: ['added.rs', 'conflict.rs', 'ignored.rs', 'modified.rs', 'unchanged.rs', 'untracked.rs'],
    initialGitStatus: [
      { path: 'added.rs', status: 'added' },
      { path: 'conflict.rs', status: 'conflict' },
      { path: 'ignored.rs', status: 'ignored' },
      { path: 'modified.rs', status: 'modified' },
      { path: 'untracked.rs', status: 'untracked' },
    ],
  });
  return (
    <HelpIllustration className="h-38 bg-background py-1" note={children}>
      <FileTree model={model} />
    </HelpIllustration>
  );
}
