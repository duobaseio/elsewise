import { FileTree, useFileTree } from '@elsewise/components/components/file-tree';
import type { ReactNode } from 'react';
import { HelpIllustration } from '../-help-illustration';

export function GitStatusBadgesHelp({ enabled, children }: { enabled: boolean; children: ReactNode }) {
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
      <FileTree model={model} gitStatusBadges={enabled} />
    </HelpIllustration>
  );
}

export function IndentGuidesHelp({ enabled }: { enabled: boolean }) {
  const model = useFileTree({
    initialPaths: ['src/', 'src/lexer/', 'src/lexer/mod.rs', 'src/lexer/token.rs', 'src/main.rs', 'Cargo.toml'],
    initialExpandedPaths: ['src/', 'src/lexer/'],
  });
  return (
    <HelpIllustration className="h-38 bg-background py-1">
      <FileTree model={model} indentGuides={enabled} />
    </HelpIllustration>
  );
}

export function HiddenHelp() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2">
      {[
        ['*.log', 'Every .log file and folder'],
        ['out/', 'Every folder named “out”'],
        ['/build', 'Only the top-level “build”'],
        ['src/gen', 'Only the top-level “src/gen”'],
      ].map(([pattern, hides]) => (
        <div key={pattern} className="contents">
          <dt>{pattern}</dt>
          <dd className="text-text-2">{hides}</dd>
        </div>
      ))}
    </dl>
  );
}
