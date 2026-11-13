import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { FileTree, type FileTreeGitStatus, type FileTreeOptions, useFileTree } from '../../src/components/file-tree';

import { forcePseudoStates, Sheet, THEMES } from '../sheet';
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

const CUT_PATHS = [
  'src/',
  'src/cut.rs',
  'src/modified-cut.rs',
  'src/modified.rs',
  'src/rest.rs',
  'cut-folder/',
  'cut-folder/child.rs',
] as const;

const CUT_GIT_STATUS: readonly FileTreeGitStatus[] = [
  { path: 'src/modified-cut.rs', status: 'modified' },
  { path: 'src/modified.rs', status: 'modified' },
];

const CUT = ['src/cut.rs', 'src/modified-cut.rs', 'cut-folder/'] as const;

const SELECTED_PATHS = ['expanded/', 'expanded/child.rs', 'collapsed/', 'collapsed/hidden.rs'] as const;

const PSEUDO_PATHS = ['src/', 'src/hover.rs', 'src/focus.rs', 'src/selected-hover.rs', 'src/rest.rs'] as const;

const DROP_TARGET_PATHS = ['src/', 'src/selected.rs', 'src/modified.rs', 'root-file.toml'] as const;

const DRAG_PATHS = ['lib/', 'lib/nested/', 'lib/nested/dragged.rs', 'src/', 'src/main.rs', 'root-file.toml'] as const;

const DRAG_EXPANDED = ['lib/', 'lib/nested/', 'src/'] as const;

// Each box must clear every row: row count at 24px plus the tree's padding.
const STRUCTURE_ROWS = 25;
const STRUCTURE_BOX = 'h-152 w-56';
const SELECTED_ROWS = 3;
const SELECTED_BOX = 'h-20 w-56';
const PSEUDO_ROWS = 5;
const PSEUDO_BOX = 'h-32 w-56';
const BADGES_ROWS = 8;
const BADGES_BOX = 'h-50 w-56';
const CUT_ROWS = 7;
const CUT_BOX = 'h-44 w-56';
// Taller than its rows, so the tint shows on the empty space below them too.
const DROP_TARGET_ROWS = 4;
const DROP_TARGET_BOX = 'h-40 w-56';
// Taller than its rows, so the drag image has room below them.
const DRAG_ROWS = 6;
const DRAG_BOX = 'h-52 w-56';

function shadowRoot(): ShadowRoot {
  const root = document.querySelector('file-tree-container')?.shadowRoot;
  if (root == null) {
    throw new Error('no shadow root');
  }
  return root;
}

function row(path: string): HTMLElement {
  const element = shadowRoot().querySelector<HTMLElement>(`[data-item-path="${path}"]`);
  if (element == null) {
    throw new Error(`no row for ${path}`);
  }
  return element;
}

function drag(type: 'dragstart' | 'dragover', element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: new DataTransfer(),
      clientX: rect.left + 40,
      clientY: rect.top + rect.height / 2,
    }),
  );
}

// Drags the row at `path`, and shows the drag image the tree made for it below the rows.
async function showDragImage(path: string) {
  drag('dragstart', row(path));
  const preview = await vi.waitFor(() => {
    const element = shadowRoot().querySelector<HTMLElement>('[data-file-tree-drag-preview="true"]');
    if (element == null) {
      throw new Error('no drag image');
    }
    return element;
  });
  const host = shadowRoot().host.getBoundingClientRect();
  preview.style.transform = `translate3d(${host.left + 24}px, ${host.bottom - 40}px, 0)`;
}

function Tree({
  box,
  label,
  cutPaths,
  gitStatusBadges,
  indentGuides,
  dropTarget,
  ...options
}: FileTreeOptions & {
  box: string;
  label: string;
  cutPaths?: readonly string[];
  gitStatusBadges?: boolean;
  indentGuides?: boolean;
  dropTarget?: string;
}) {
  const model = useFileTree(options);
  return (
    <div className={box}>
      <FileTree
        aria-label={label}
        cutPaths={cutPaths}
        gitStatusBadges={gitStatusBadges}
        indentGuides={indentGuides}
        dropTarget={dropTarget}
        model={model}
      />
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

test.each(THEMES)('file tree selected folders (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={SELECTED_BOX}
        initialExpandedPaths={['expanded/']}
        initialPaths={SELECTED_PATHS}
        initialSelectedPaths={['expanded/', 'collapsed/']}
        label="Selected folders"
      />
    </Sheet>,
  );

  await settleTree(SELECTED_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-selected-${theme}`);
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

test.each(THEMES)('file tree without indent guides (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={STRUCTURE_BOX}
        indentGuides={false}
        initialExpandedPaths={STRUCTURE_EXPANDED}
        initialPaths={STRUCTURE_PATHS}
        label="No indent guides"
      />
    </Sheet>,
  );

  await settleTree(STRUCTURE_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-no-indent-guides-${theme}`);
});

test.each(THEMES)('file tree cut paths (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={CUT_BOX}
        cutPaths={CUT}
        initialExpandedPaths={['src/', 'cut-folder/']}
        initialGitStatus={CUT_GIT_STATUS}
        initialPaths={CUT_PATHS}
        label="Cut paths"
      />
    </Sheet>,
  );

  await settleTree(CUT_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-cut-${theme}`);
});

test.each(THEMES)('file tree drop target (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={DROP_TARGET_BOX}
        dropTarget=""
        initialExpandedPaths={['src/']}
        initialGitStatus={[{ path: 'src/modified.rs', status: 'modified' }]}
        initialPaths={DROP_TARGET_PATHS}
        initialSelectedPaths={['src/selected.rs']}
        label="Drop target"
      />
    </Sheet>,
  );

  await settleTree(DROP_TARGET_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-drop-target-${theme}`);
});

test.each(THEMES)('file tree folder drop target (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree
        box={DROP_TARGET_BOX}
        dropTarget="src/"
        initialExpandedPaths={['src/']}
        initialGitStatus={[{ path: 'src/modified.rs', status: 'modified' }]}
        initialPaths={DROP_TARGET_PATHS}
        label="Folder drop target"
      />
    </Sheet>,
  );

  await settleTree(DROP_TARGET_ROWS);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-folder-drop-target-${theme}`);
});

test.each(THEMES)('file tree file drag image (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree box={DRAG_BOX} initialExpandedPaths={DRAG_EXPANDED} initialPaths={DRAG_PATHS} label="File drag image" />
    </Sheet>,
  );
  await settleTree(DRAG_ROWS);

  await showDragImage('lib/nested/dragged.rs');

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-file-drag-image-${theme}`);
});

test.each(THEMES)('file tree folder drag image (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree box={DRAG_BOX} initialExpandedPaths={DRAG_EXPANDED} initialPaths={DRAG_PATHS} label="Folder drag image" />
    </Sheet>,
  );
  await settleTree(DRAG_ROWS);

  await showDragImage('lib/nested/');

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-folder-drag-image-${theme}`);
});

test.each(THEMES)('file tree dragging over folder (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <Tree box={DRAG_BOX} initialExpandedPaths={DRAG_EXPANDED} initialPaths={DRAG_PATHS} label="Dragging" />
    </Sheet>,
  );
  await settleTree(DRAG_ROWS);

  drag('dragstart', row('lib/nested/dragged.rs'));
  drag('dragover', row('src/'));
  await vi.waitFor(() => expect(row('src/').dataset.itemDragTarget).toBe('true'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-tree-dragging-${theme}`);
});
