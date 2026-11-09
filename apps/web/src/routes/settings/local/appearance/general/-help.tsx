import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import type { ReactNode } from 'react';
import { HelpIllustration } from '../-help-illustration';

/**
 * Shows the git status badges of a worktree's files in the file tree.
 */
export function GitStatusBadgesHelp({ children }: { children: ReactNode }) {
  const model = useFileTree({
    initialPaths: ['src/', 'src/lexer.rs', 'src/main.rs', 'src/parser.rs', 'target/', 'build.rs', 'notes.md'],
    initialExpandedPaths: ['src/'],
    initialGitStatus: [
      { path: 'src/main.rs', status: 'modified' },
      { path: 'src/parser.rs', status: 'added' },
      { path: 'target/', status: 'ignored' },
      { path: 'build.rs', status: 'conflict' },
      { path: 'notes.md', status: 'untracked' },
    ],
  });
  return (
    <HelpIllustration className="h-44 bg-background py-1" note={children}>
      <FileTree model={model} />
    </HelpIllustration>
  );
}
