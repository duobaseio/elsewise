import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { forcePseudoStates } from '../../../test/sheet';
import { settleTree } from '../../../test/tree-harness';
import { FileIconProvider, type FileIcons } from '../file-icon';
import { FileTree, type FileTreeGitStatus, type FileTreeModel, type FileTreeOptions, useFileTree } from '../file-tree';
import { IconProvider, type Icons } from '../icon';

const PATHS = [
  'daemon/',
  'daemon/src/',
  'daemon/src/main.rs',
  'daemon/src/conflict.rs',
  'daemon/sibling.rs',
  'daemon/Cargo.toml',
  'README.md',
  'vendor/',
  'vendor/lib.rs',
] as const;

const GIT_STATUS: readonly FileTreeGitStatus[] = [
  { path: 'daemon/src/main.rs', status: 'modified' },
  { path: 'daemon/src/conflict.rs', status: 'conflict' },
  { path: 'daemon/Cargo.toml', status: 'added' },
  { path: 'daemon/sibling.rs', status: 'untracked' },
  { path: 'vendor/', status: 'ignored' },
];

const ROWS = 8;
const ICON_LANE = 16;
const ROW_GAP = 6;

async function mount(options: Partial<FileTreeOptions> = {}, gitStatusBadges?: boolean) {
  const model: { current: FileTreeModel | null } = { current: null };

  function Harness() {
    model.current = useFileTree({
      initialExpandedPaths: ['daemon/', 'daemon/src/'],
      initialGitStatus: GIT_STATUS,
      initialPaths: PATHS,
      ...options,
    });
    return <FileTree aria-label="Geometry" gitStatusBadges={gitStatusBadges} model={model.current} />;
  }

  await render(
    <div className="h-64 w-72">
      <Harness />
    </div>,
  );
  await settleTree(ROWS);
  const shadowRoot = document.querySelector('file-tree-container')?.shadowRoot;
  if (shadowRoot == null) {
    throw new Error('no shadow root');
  }
  return { model, shadowRoot };
}

function isExpanded(model: FileTreeModel | null, path: string): boolean {
  const item = model?.getItem(path);
  return item != null && 'isExpanded' in item && item.isExpanded();
}

function row(shadowRoot: ShadowRoot, path: string): HTMLElement {
  const element = shadowRoot.querySelector<HTMLElement>(`[data-item-path="${path}"]`);
  if (element == null) {
    throw new Error(`no row for ${path}`);
  }
  return element;
}

function section(shadowRoot: ShadowRoot, path: string, name: string): HTMLElement {
  const element = row(shadowRoot, path).querySelector<HTMLElement>(`[data-item-section="${name}"]`);
  if (element == null) {
    throw new Error(`no ${name} section for ${path}`);
  }
  return element;
}

function iconLane(shadowRoot: ShadowRoot, path: string): DOMRect {
  return section(shadowRoot, path, 'icon').getBoundingClientRect();
}

function token(name: string): string {
  const host = document.querySelector<HTMLElement>('file-tree-container');
  if (host == null) {
    throw new Error('no host');
  }
  return getComputedStyle(host).getPropertyValue(name).trim();
}

function rgb(hex: string): string {
  const [, r, g, b] = /^#(\w{2})(\w{2})(\w{2})$/.exec(hex) ?? [];
  if (b === undefined) {
    throw new Error(`not a hex colour: ${hex}`);
  }
  return `rgb(${Number.parseInt(r, 16)}, ${Number.parseInt(g, 16)}, ${Number.parseInt(b, 16)})`;
}

function folderIconCentre(shadowRoot: ShadowRoot, path: string): number {
  return iconLane(shadowRoot, path).left + ICON_LANE + ROW_GAP + ICON_LANE / 2;
}

function fileIconCentre(shadowRoot: ShadowRoot, path: string): number {
  const lane = iconLane(shadowRoot, path);
  return lane.left + lane.width / 2;
}

function chevronCentre(shadowRoot: ShadowRoot, path: string): number {
  return iconLane(shadowRoot, path).left + ICON_LANE / 2;
}

test('rows are exactly 24px at compact density', async () => {
  const { shadowRoot } = await mount();
  expect(row(shadowRoot, 'README.md').getBoundingClientRect().height).toBe(24);
});

test('the row metrics behind every indent hold', async () => {
  const { shadowRoot } = await mount();
  expect(token('--trees-icon-width')).toBe(`${ICON_LANE}px`);
  expect(token('--trees-item-row-gap')).toBe(`${ROW_GAP}px`);
  expect(getComputedStyle(section(shadowRoot, 'README.md', 'content')).fontSize).toBe('13px');
});

test('every icon keeps the full lane, chevron included', async () => {
  const { shadowRoot } = await mount();
  const box = (path: string) => {
    const svg = section(shadowRoot, path, 'icon').querySelector('svg');
    if (svg == null) {
      throw new Error(`no icon svg for ${path}`);
    }
    return svg.getBoundingClientRect();
  };

  for (const path of ['daemon/', 'README.md']) {
    expect(box(path).width).toBe(ICON_LANE);
    expect(box(path).height).toBe(ICON_LANE);
  }
});

test("the chevron sits on the row's vertical centre", async () => {
  const { shadowRoot } = await mount();
  const chevron = section(shadowRoot, 'daemon/', 'icon').querySelector('svg')?.getBoundingClientRect();
  const line = row(shadowRoot, 'daemon/').getBoundingClientRect();
  if (chevron == null) {
    throw new Error('no chevron');
  }

  expect(chevron.top + chevron.height / 2).toBe(line.top + line.height / 2);
});

test('theme.css reaches the host, and density keeps the inline style to itself', async () => {
  await mount();
  const host = document.querySelector<HTMLElement>('file-tree-container');
  if (host == null) {
    throw new Error('no host');
  }

  expect(getComputedStyle(host).getPropertyValue('--trees-bg').trim()).toBe('#ffffff');

  expect(host.style.getPropertyValue('--trees-item-height')).toBe('24px');
});

test("a file's icon aligns with a sibling folder's icon", async () => {
  const { shadowRoot } = await mount();
  expect(fileIconCentre(shadowRoot, 'daemon/sibling.rs')).toBeCloseTo(folderIconCentre(shadowRoot, 'daemon/src/'), 1);
});

test("a child's chevron aligns with its parent's folder icon", async () => {
  const { shadowRoot } = await mount();
  expect(chevronCentre(shadowRoot, 'daemon/src/')).toBeCloseTo(folderIconCentre(shadowRoot, 'daemon/'), 1);
});

test('a folder with no aria-expanded still renders the open icon', async () => {
  const { shadowRoot } = await mount();
  const folder = row(shadowRoot, 'daemon/');
  const lane = folder.querySelector('[data-item-section="icon"]');
  if (lane == null) {
    throw new Error('no icon lane');
  }

  const open = getComputedStyle(lane, '::after').maskImage;
  expect(open).toMatch(/^url\("data:image\/svg\+xml,/);

  folder.setAttribute('aria-expanded', 'false');
  const closed = getComputedStyle(lane, '::after').maskImage;
  expect(closed).not.toBe(open);

  folder.removeAttribute('aria-expanded');
  expect(getComputedStyle(lane, '::after').maskImage).toBe(open);
});

test('git status colours the name, never the icon', async () => {
  const { shadowRoot } = await mount();
  expect(getComputedStyle(section(shadowRoot, 'daemon/src/main.rs', 'content')).color).toBe(
    rgb(token('--trees-status-modified')),
  );
  expect(getComputedStyle(section(shadowRoot, 'daemon/src/main.rs', 'icon')).color).toBe(
    rgb(token('--trees-fg-muted')),
  );
});

test('each status carries its letter', async () => {
  const { shadowRoot } = await mount();
  const letter = (path: string) => section(shadowRoot, path, 'git').querySelector('span')?.textContent;

  expect(letter('daemon/src/main.rs')).toBe('M');
  expect(letter('daemon/Cargo.toml')).toBe('A');
  expect(letter('daemon/sibling.rs')).toBe('U');
  expect(letter('vendor/')).toBeUndefined();
});

test('badges off hides the letter and keeps the colour', async () => {
  const { shadowRoot } = await mount({}, false);
  expect(getComputedStyle(section(shadowRoot, 'daemon/src/main.rs', 'git')).display).toBe('none');
  expect(getComputedStyle(section(shadowRoot, 'daemon/src/main.rs', 'content')).color).toBe(
    rgb(token('--trees-status-modified')),
  );
});

test('a folder marked only by a descendant shows nothing', async () => {
  const { shadowRoot } = await mount();
  expect(row(shadowRoot, 'daemon/').getAttribute('data-item-contains-git-change')).toBe('true');
  expect(getComputedStyle(section(shadowRoot, 'daemon/', 'git')).display).toBe('none');

  expect(getComputedStyle(section(shadowRoot, 'vendor/', 'content')).color).toBe(rgb(token('--trees-status-ignored')));
});

test('conflict shows "!" and still carries the wrong title', async () => {
  const { shadowRoot } = await mount();
  const lane = row(shadowRoot, 'daemon/src/conflict.rs').querySelector('[data-item-section="git"] > span');
  if (lane == null) {
    throw new Error('no git lane');
  }

  expect(getComputedStyle(lane, '::after').content).toBe('"!"');
  // Conflict rides their unused `deleted` slot and CSS cannot reach a `title`. Fails the day upstream grows one.
  expect(lane.getAttribute('title')).toBe('Git status: deleted');
});

test('clicking a folder toggles its expansion in the model', async () => {
  const { model, shadowRoot } = await mount();
  expect(isExpanded(model.current, 'daemon/src/')).toBe(true);

  const announced: [string, boolean][] = [];
  const stop = model.current?.onExpansion((path, expanded) => announced.push([path, expanded]));

  row(shadowRoot, 'daemon/src/').click();
  await vi.waitFor(() => expect(isExpanded(model.current, 'daemon/src/')).toBe(false));
  expect(shadowRoot.querySelectorAll('[data-type="item"]').length).toBe(ROWS - 2);
  expect(announced).toEqual([['daemon/src/', false]]);

  stop?.();
  row(shadowRoot, 'daemon/src/').click();
  await vi.waitFor(() => expect(isExpanded(model.current, 'daemon/src/')).toBe(true));
  expect(announced).toEqual([['daemon/src/', false]]);
});

test('selecting a row reports its path', async () => {
  const selections: readonly string[][] = [];
  const { shadowRoot } = await mount({
    onSelectionChange: (paths) => (selections as string[][]).push([...paths]),
  });

  row(shadowRoot, 'README.md').click();
  await vi.waitFor(() => expect(selections.at(-1)).toEqual(['README.md']));
});

test('shift-click selects the range between two rows', async () => {
  const selections: readonly string[][] = [];
  const { shadowRoot } = await mount({
    onSelectionChange: (paths) => (selections as string[][]).push([...paths]),
  });

  const click = (path: string, init: MouseEventInit = {}) => {
    const target = row(shadowRoot, path);
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...init }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...init }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
  };

  click('daemon/src/main.rs');
  click('README.md', { shiftKey: true });

  await vi.waitFor(() =>
    expect(selections.at(-1)).toEqual([
      'daemon/src/main.rs',
      'daemon/Cargo.toml',
      'daemon/sibling.rs',
      'vendor/',
      'README.md',
    ]),
  );
});

test('the indent guides do not wait for a hover', async () => {
  const { shadowRoot } = await mount();
  const guide = row(shadowRoot, 'daemon/src/main.rs').querySelector('[data-item-section="spacing-item"]');
  if (guide == null) {
    throw new Error('no indent guide');
  }

  expect(getComputedStyle(guide).opacity).toBe('1');
  expect(getComputedStyle(guide).transitionDuration).toBe('0s');
});

test('the focus ring is keyboard-only', async () => {
  const { shadowRoot } = await mount();
  const target = row(shadowRoot, 'README.md');
  target.setAttribute('data-item-focused', 'true');
  expect(getComputedStyle(target, '::before').outlineStyle).toBe('none');

  await forcePseudoStates([{ selector: '[data-item-path="README.md"]', pseudoClasses: ['focus', 'focus-visible'] }]);
  const focused = getComputedStyle(target, '::before');
  expect(focused.outlineStyle).not.toBe('none');
  expect(focused.outlineWidth).toBe('2px');
});

test('F2 opens an inline rename input', async () => {
  const { shadowRoot } = await mount();
  await userEvent.click(row(shadowRoot, 'README.md'));
  await userEvent.keyboard('{F2}');

  const input = await vi.waitFor(() => {
    const found = shadowRoot.querySelector('input[data-item-rename-input="true"]');
    if (found == null) {
      throw new Error('no rename input');
    }
    return found;
  });
  expect(input.getAttribute('aria-label')).toBe('Rename README.md');
});

test('search stays disabled', async () => {
  const { model, shadowRoot } = await mount();
  expect(shadowRoot.querySelectorAll('input')).toHaveLength(0);

  await userEvent.click(row(shadowRoot, 'README.md'));
  await userEvent.keyboard('daemon');

  expect(shadowRoot.querySelectorAll('input')).toHaveLength(0);
  expect(model.current?.isSearchOpen()).toBe(false);
});

test('FileIconProvider overrides reach the tree, at mount and on change', async () => {
  const lettersOf = (shadowRoot: ShadowRoot, path: string) => {
    const href = section(shadowRoot, path, 'icon').querySelector('use')?.getAttribute('href');
    return href == null ? undefined : shadowRoot.querySelector(`symbol${href} text`)?.textContent;
  };
  const letters = (text: string): Partial<FileIcons> => ({
    extensions: { rs: { kind: 'letters', letters: text, tint: null } },
  });

  function Harness({ icons }: { icons: Partial<FileIcons> }) {
    return (
      <FileIconProvider icons={icons}>
        <Tree />
      </FileIconProvider>
    );
  }
  function Tree() {
    const model = useFileTree({ initialExpandedPaths: ['daemon/', 'daemon/src/'], initialPaths: PATHS });
    return <FileTree aria-label="Overrides" model={model} />;
  }

  const first = letters('XA');
  const screen = await render(<Harness icons={first} />);
  await settleTree(ROWS);
  const shadowRoot = document.querySelector('file-tree-container')?.shadowRoot;
  if (shadowRoot == null) {
    throw new Error('no shadow root');
  }
  expect(lettersOf(shadowRoot, 'daemon/src/main.rs')).toBe('XA');

  await screen.rerender(<Harness icons={letters('XB')} />);
  await vi.waitFor(() => expect(lettersOf(shadowRoot, 'daemon/src/main.rs')).toBe('XB'));
});

test('IconProvider overrides reach the chevron and the folder icons', async () => {
  const mark = (id: string) => () => (
    <svg data-mark={id} viewBox="0 0 24 24">
      <title>{id}</title>
      <rect width="24" height="24" />
    </svg>
  );
  const icons: Partial<Icons> = { expand: mark('chevron'), folder: mark('closed'), 'folder-open': mark('open') };

  function Tree() {
    const model = useFileTree({ initialExpandedPaths: ['daemon/', 'daemon/src/'], initialPaths: PATHS });
    return <FileTree aria-label="Overrides" model={model} />;
  }

  await render(
    <IconProvider icons={icons}>
      <Tree />
    </IconProvider>,
  );
  await settleTree(ROWS);
  const shadowRoot = document.querySelector('file-tree-container')?.shadowRoot;
  if (shadowRoot == null) {
    throw new Error('no shadow root');
  }

  await vi.waitFor(() =>
    expect(decodeURIComponent(shadowRoot.querySelector('#ew-chevron image')?.getAttribute('href') ?? '')).toContain(
      'data-mark="chevron"',
    ),
  );
  const mask = (path: string) =>
    decodeURIComponent(getComputedStyle(section(shadowRoot, path, 'icon'), '::after').maskImage);
  expect(mask('daemon/')).toContain('data-mark="open"');
  expect(mask('vendor/')).toContain('data-mark="closed"');
});
