import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { PrepareRenameParams, RenameParams } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { commandsExtension } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const URI = 'file:///worktree/main.rs';

const DOC = 'let total = 1;\ntotal + total';

// Where `total` is, by line and character.
const TOTALS = [
  [0, 4],
  [1, 0],
  [1, 8],
];

const range = ([line, character]: number[]) => ({
  start: { line, character },
  end: { line, character: character + 'total'.length },
});

interface Server {
  prepare?: boolean;
  /**
   * Whether `total` can be renamed.
   */
  renamable?: boolean;
  /**
   * The rename requests received.
   */
  renames?: string[];
  /**
   * The positions of the prepare requests received.
   */
  prepares?: unknown[];
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` with the cursor in the first `total`, on a server given by `server`.
async function open({
  prepare = true,
  renamable = true,
  renames = [],
  prepares = [],
}: Server = {}): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () =>
        new StubTransport(
          {
            textDocumentSync: 2,
            renameProvider: prepare ? { prepareProvider: true } : true,
            documentHighlightProvider: true,
          },
          {
            'textDocument/prepareRename': ({ position }: PrepareRenameParams) => {
              prepares.push(position);
              return renamable ? range(TOTALS[0]) : null;
            },
            'textDocument/documentHighlight': () => TOTALS.map((total) => ({ range: range(total) })),
            'textDocument/rename': ({ newName }: RenameParams) => {
              renames.push(newName);
              return { changes: { [URI]: TOTALS.map((total) => ({ range: range(total), newText: newName })) } };
            },
          },
        ),
    } satisfies LanguageServer,
    ROOT,
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: 6 },
      extensions: [instance.client.plugin(URI, 'rust'), commandsExtension(), history()],
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

// Presses Shift-F6, and returns the field once it has focus.
async function rename(view: EditorView): Promise<HTMLInputElement> {
  expect(press(view, 'F6', { shiftKey: true })).toBe(true);
  return vi.waitFor(() => {
    const input = view.dom.querySelector<HTMLInputElement>('.cm-lsp-rename-field input');
    expect(document.activeElement).toBe(input);
    return input as HTMLInputElement;
  });
}

describe('serverRename', () => {
  test('replaces symbol with field holding name, selected', async () => {
    const view = await open();

    const input = await rename(view);

    expect(input.value).toBe('total');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
  });

  test('shows typed name at other occurrences, without changing document', async () => {
    const view = await open();
    await rename(view);

    await userEvent.keyboard('sum');

    const occurrences = [...view.dom.querySelectorAll('.cm-lsp-rename-occurrence')];
    expect(occurrences.map((occurrence) => occurrence.textContent)).toEqual(['sum', 'sum']);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('renames on Enter, in one undo step', async () => {
    const view = await open();
    await rename(view);

    await userEvent.keyboard('sum{Enter}');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let sum = 1;\nsum + sum'));
    expect(view.dom.querySelector('.cm-lsp-rename-field')).toBeNull();
    expect(view.hasFocus).toBe(true);
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('renames on blur', async () => {
    const view = await open();
    const input = await rename(view);

    await userEvent.keyboard('sum');
    input.blur();

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let sum = 1;\nsum + sum'));
  });

  test('cancels on Escape', async () => {
    const renames: string[] = [];
    const view = await open({ renames });
    await rename(view);

    await userEvent.keyboard('sum{Escape}');

    expect(view.dom.querySelector('.cm-lsp-rename-field')).toBeNull();
    expect(view.dom.querySelector('.cm-lsp-rename-occurrence')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
    expect(view.hasFocus).toBe(true);
    expect(renames).toEqual([]);
  });

  test("says when symbol can't be renamed", async () => {
    const view = await open({ renamable: false });

    expect(press(view, 'F6', { shiftKey: true })).toBe(true);

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-lsp-rename-message')?.textContent).toBe("This can't be renamed");
    });
    expect(view.dom.querySelector('.cm-lsp-rename-field')).toBeNull();
    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-rename-message')).toBeNull();
  });

  test("prepares again after symbol can't be renamed", async () => {
    const prepares: unknown[] = [];
    const view = await open({ renamable: false, prepares });
    press(view, 'F6', { shiftKey: true });
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-lsp-rename-message')).not.toBeNull());

    press(view, 'F6', { shiftKey: true });

    await vi.waitFor(() => expect(prepares).toHaveLength(2));
  });

  test('renames word at cursor without prepare', async () => {
    const view = await open({ prepare: false });

    const input = await rename(view);

    expect(input.value).toBe('total');
  });

  test('ignores repeat while preparing', async () => {
    const prepares: unknown[] = [];
    const view = await open({ prepares });

    expect(press(view, 'F6', { shiftKey: true })).toBe(true);
    await rename(view);

    expect(prepares).toHaveLength(1);
  });

  test('skips server for unchanged name', async () => {
    const renames: string[] = [];
    const view = await open({ renames });
    await rename(view);

    await userEvent.keyboard('{Enter}');

    expect(view.dom.querySelector('.cm-lsp-rename-field')).toBeNull();
    expect(renames).toEqual([]);
  });
});
