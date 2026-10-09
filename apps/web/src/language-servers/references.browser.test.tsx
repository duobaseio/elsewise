import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { OS } from '@elsewise/components/lib/os';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { type StubTransport, stubTransport } from '../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const URI = 'file:///worktree/main.rs';

const DOC = 'let total = 1;\ntotal + total';

// Where `total` is, by line and character.
const TOTALS = [
  [0, 4],
  [1, 0],
  [1, 8],
];

const location = ([line, character]: number[], uri = URI) => ({
  uri,
  range: { start: { line, character }, end: { line, character: character + 'total'.length } },
});

// Returns a transport to a server that finds `locations` as the usages of `total` in `DOC`.
function transport(locations: unknown[]): StubTransport {
  return stubTransport(
    { textDocumentSync: 2, referencesProvider: true },
    { 'textDocument/references': () => locations },
  );
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `doc` in an editor 200px high with the cursor in the first `total`, on a server finding `locations`.
async function open(locations: unknown[] = TOTALS.map((total) => location(total)), doc = DOC): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () => transport(locations),
    } satisfies LanguageServer,
    ROOT,
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: 6 },
      extensions: [instance.client.plugin(URI, 'rust'), EditorView.theme({ '&': { height: '200px' } })],
    }),
    parent: document.body,
  });
  views.push(view);
  view.focus();
  return view;
}

function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): boolean {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key, ...modifiers }), 'editor');
}

// Mod-Alt-F7, which shows usages.
const SHOW_USAGES: KeyboardEventInit = { altKey: true, metaKey: OS === 'mac', ctrlKey: OS !== 'mac' };

// Presses Mod-Alt-F7, and returns the popup once it shows.
async function find(view: EditorView): Promise<HTMLElement> {
  expect(press(view, 'F7', SHOW_USAGES)).toBe(true);
  return vi.waitFor(() => {
    const popup = view.dom.querySelector<HTMLElement>('.cm-lsp-references');
    expect(popup).not.toBeNull();
    return popup as HTMLElement;
  });
}

function rows(popup: HTMLElement): HTMLElement[] {
  return [...popup.querySelectorAll<HTMLElement>('.cm-lsp-reference')];
}

function selected(popup: HTMLElement): number {
  return rows(popup).findIndex((row) => row.ariaSelected === 'true');
}

describe('serverReferences', () => {
  test('lists the usages with the one at the cursor selected', async () => {
    const view = await open();

    const popup = await find(view);

    expect(popup.querySelector('.cm-lsp-references-header')?.textContent).toBe('Usages of total3 usages');
    expect(rows(popup)).toHaveLength(3);
    expect(selected(popup)).toBe(0);
    expect(popup.querySelector('.cm-lsp-references-hint')).not.toBeNull();
  });

  test('shows each usage in its line, marked, with the line number', async () => {
    const view = await open();

    const popup = await find(view);

    expect(rows(popup).map((row) => row.querySelector('.cm-lsp-reference-preview')?.textContent)).toEqual([
      'let total = 1;',
      'total + total',
      'total + total',
    ]);
    expect(rows(popup).map((row) => row.querySelector('.cm-lsp-reference-match')?.textContent)).toEqual([
      'total',
      'total',
      'total',
    ]);
    expect(rows(popup).map((row) => row.querySelector('.cm-lsp-reference-location')?.textContent)).toEqual([
      'main.rs1',
      'main.rs2',
      'main.rs2',
    ]);
  });

  test('moves the selection with the arrows, wrapping, without moving the cursor', async () => {
    const view = await open();
    const popup = await find(view);

    press(view, 'ArrowUp');
    expect(selected(popup)).toBe(2);
    press(view, 'ArrowDown');
    press(view, 'ArrowDown');

    expect(selected(popup)).toBe(1);
    expect(view.state.selection.main.head).toBe(6);
  });

  test('moves the cursor to the selected usage on Enter', async () => {
    const view = await open();
    await find(view);

    press(view, 'ArrowDown');
    press(view, 'ArrowDown');
    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.selection.main.head).toBe(23));
    expect(view.dom.querySelector('.cm-lsp-references')).toBeNull();
  });

  test('moves the cursor to a usage when it is clicked', async () => {
    const view = await open();
    const popup = await find(view);

    rows(popup)[1].click();

    await vi.waitFor(() => expect(view.state.selection.main.head).toBe(15));
    expect(view.dom.querySelector('.cm-lsp-references')).toBeNull();
  });

  test('closes on Escape, and when the document changes', async () => {
    const view = await open();
    await find(view);

    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-references')).toBeNull();

    await find(view);
    view.dispatch({ changes: { from: 0, insert: ' ' } });
    expect(view.dom.querySelector('.cm-lsp-references')).toBeNull();
  });

  test('lists a usage in a file that is not open by its name and line, and skips it', async () => {
    const view = await open([
      ...TOTALS.map((total) => location(total)),
      location([41, 2], 'file:///worktree/a%20b.rs'),
    ]);
    const popup = await find(view);

    const elsewhere = rows(popup)[3];
    expect(elsewhere.ariaDisabled).toBe('true');
    expect(elsewhere.querySelector('.cm-lsp-reference-preview')?.textContent).toBe('');
    expect(elsewhere.querySelector('.cm-lsp-reference-location')?.textContent).toBe('a b.rs42');
    press(view, 'ArrowUp');
    expect(selected(popup)).toBe(2);
  });

  test('moves the cursor to the only other usage, without a popup', async () => {
    const view = await open([location(TOTALS[0]), location(TOTALS[2])]);

    press(view, 'F7', SHOW_USAGES);

    await vi.waitFor(() => expect(view.state.selection.main.head).toBe(23));
    expect(view.dom.querySelector('.cm-lsp-references')).toBeNull();
  });

  test('scrolls a usage out of view to the middle of the editor', async () => {
    const view = await open(
      [location(TOTALS[0]), location([101, 0])],
      `${DOC}${'\n'.repeat(100)}total${'\n'.repeat(100)}`,
    );

    press(view, 'F7', SHOW_USAGES);

    await vi.waitFor(() => {
      const usage = view.coordsAtPos(view.state.selection.main.head);
      const bounds = view.scrollDOM.getBoundingClientRect();
      expect(usage).not.toBeNull();
      expect(Math.abs((usage?.top ?? 0) - (bounds.top + bounds.height / 2))).toBeLessThan(20);
    });
  });

  test('says when there are no other usages', async () => {
    const view = await open([location(TOTALS[0])]);

    press(view, 'F7', SHOW_USAGES);

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-lsp-references-message')?.textContent).toBe('No usages found');
    });
    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-references-message')).toBeNull();
  });
});
