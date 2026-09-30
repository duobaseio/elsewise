import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { FileTree, type FileTreeGitStatus, type FileTreeOptions, useFileTree } from '../../src/components/file-tree';

import { forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';
import { settleTree } from '../tree-harness';

const STRUCTURE_PATHS = [
  'src/',
  'src/statuses/',
  'src/statuses/plain.rs',
  'src/statuses/modified.rs',
  'src/statuses/added.rs',
  'src/statuses/untracked.rs',
  'src/statuses/conflict.rs',
  'src/statuses/ignored.rs',
  'src/languages/',
  'src/languages/main.ts',
  'src/languages/app.tsx',
  'src/languages/main.py',
  'src/languages/Main.java',
  'src/languages/build.gradle.kts',
  'src/languages/styles.css',
  'src/languages/package.json',
  'src/languages/readme.md',
  'src/languages/Dockerfile',
  'src/languages/Makefile',
  'src/languages/notes.txt',
  'src/languages/notes.qqqzzz',
  'src/collapsed/',
  'src/collapsed/hidden.rs',
  'src/active.rs',
  'ignored-folder/',
  'ignored-folder/hidden.rs',
  'root-file.toml',
] as const;

const STRUCTURE_EXPANDED = ['src/', 'src/statuses/', 'src/languages/'] as const;

const STRUCTURE_GIT_STATUS: readonly FileTreeGitStatus[] = [
  { path: 'src/statuses/modified.rs', status: 'modified' },
  { path: 'src/statuses/added.rs', status: 'added' },
  { path: 'src/statuses/untracked.rs', status: 'untracked' },
  { path: 'src/statuses/conflict.rs', status: 'conflict' },
  { path: 'src/statuses/ignored.rs', status: 'ignored' },
  { path: 'ignored-folder/', status: 'ignored' },
];

const BADGES_PATHS = [
  'src/',
  'src/plain.rs',
  'src/modified.rs',
  'src/added.rs',
  'src/untracked.rs',
  'src/conflict.rs',
  'src/ignored.rs',
  'ignored-folder/',
  'ignored-folder/hidden.rs',
] as const;

const BADGES_GIT_STATUS: readonly FileTreeGitStatus[] = [
  { path: 'src/modified.rs', status: 'modified' },
  { path: 'src/added.rs', status: 'added' },
  { path: 'src/untracked.rs', status: 'untracked' },
  { path: 'src/conflict.rs', status: 'conflict' },
  { path: 'src/ignored.rs', status: 'ignored' },
  { path: 'ignored-folder/', status: 'ignored' },
];

const PSEUDO_PATHS = ['src/', 'src/hover.rs', 'src/focus.rs', 'src/selected-hover.rs', 'src/rest.rs'] as const;

// Each box must clear every row: row count at 24px plus the tree's padding.
const STRUCTURE_ROWS = 25;
const STRUCTURE_BOX = 'h-152 w-56';
const PSEUDO_ROWS = 5;
const PSEUDO_BOX = 'h-32 w-56';
const BADGES_ROWS = 8;
const BADGES_BOX = 'h-50 w-56';

function Tree({
  box,
  label,
  gitStatusBadges,
  ...options
}: FileTreeOptions & { box: string; label: string; gitStatusBadges?: boolean }) {
  const model = useFileTree(options);
  return (
    <div className={box}>
      <FileTree aria-label={label} gitStatusBadges={gitStatusBadges} model={model} />
    </div>
  );
}

test.each(THEMES)('file tree structure (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={STRUCTURE_BOX}
        initialExpandedPaths={STRUCTURE_EXPANDED}
        initialGitStatus={STRUCTURE_GIT_STATUS}
        initialPaths={STRUCTURE_PATHS}
        initialSelectedPaths={['src/active.rs']}
        label="Structure"
      />
    </Sheet>,
  );

  await settleTree(STRUCTURE_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-${theme}`);
});

test.each(THEMES)('file tree pseudo states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={PSEUDO_BOX}
        initialExpandedPaths={['src/']}
        initialPaths={PSEUDO_PATHS}
        initialSelectedPaths={['src/selected-hover.rs']}
        label="Pseudo states"
      />
    </Sheet>,
  );

  await settleTree(PSEUDO_ROWS);

  await forcePseudoStates([
    { selector: '[data-item-path="src/hover.rs"]', pseudoClasses: ['hover'] },
    { selector: '[data-item-path="src/focus.rs"]', pseudoClasses: ['focus', 'focus-visible'] },
    { selector: '[data-item-path="src/selected-hover.rs"]', pseudoClasses: ['hover'] },
    { selector: '[data-item-path="src/"]', pseudoClasses: ['hover'] },
  ]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-pseudo-${theme}`);
});

test.each(THEMES)('file tree without git status badges (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={BADGES_BOX}
        gitStatusBadges={false}
        initialExpandedPaths={['src/']}
        initialGitStatus={BADGES_GIT_STATUS}
        initialPaths={BADGES_PATHS}
        label="No git status badges"
      />
    </Sheet>,
  );

  await settleTree(BADGES_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-no-badges-${theme}`);
});
