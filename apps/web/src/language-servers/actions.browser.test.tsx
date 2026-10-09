import { history, undo } from '@codemirror/commands';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { type StubTransport, stubTransport } from '../../test/stub-transport';

const URI = 'file:///worktree/main.ts';

const DOC = 'const total = shout(1);\nconst other = 2;';

const IMPORT = 'import { shout } from "./util";\n';

// The server's problem with `shout`, which isn't imported.
const PROBLEM = {
  range: { start: { line: 0, character: 14 }, end: { line: 0, character: 19 } },
  severity: 1,
  code: 2304,
  source: 'ts',
  message: "Cannot find name 'shout'.",
};

const ADD_IMPORT = {
  title: 'Add import from "./util"',
  kind: 'quickfix',
  isPreferred: true,
  edit: {
    changes: {
      [URI]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: IMPORT }],
    },
  },
};

const SOURCE = [
  { title: 'Organize imports', kind: 'source.organizeImports', edit: { changes: {} } },
  { title: 'Sort imports', kind: 'source.sortImports', edit: { changes: {} } },
];

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` with the cursor in `shout`, on a server with `PROBLEM` that answers code actions with `actions`.
async function open(
  actions: (params: CodeActionParams) => unknown,
  capabilities: object = {},
  answers: Parameters<typeof stubTransport>[1] = {},
): Promise<{ view: EditorView; stub: StubTransport }> {
  const stub = stubTransport(
    { textDocumentSync: 2, diagnosticProvider: {}, codeActionProvider: true, ...capabilities },
    {
      'textDocument/diagnostic': () => ({ kind: 'full', items: [PROBLEM] }),
      'textDocument/codeAction': actions,
      ...answers,
    },
  );
  const instance = new LanguageServerInstance(
    {
      id: 'ts',
      name: 'TypeScript',
      languages: { TypeScript: 'typescript' },
      start: () => stub,
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: 16 },
      extensions: [instance.client.plugin(URI, 'typescript'), history()],
    }),
    parent: document.body,
  });
  views.push(view);
  view.focus();
  // Waits for the problem.
  await vi.waitFor(() => {
    let count = 0;
    forEachDiagnostic(view.state, () => count++);
    expect(count).toBe(1);
  });
  return { view, stub };
}

function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): boolean {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key, ...modifiers }), 'editor');
}

// Presses Alt-Enter, and returns the popup's rows once it shows, with `-` for its divider.
async function show(view: EditorView): Promise<string[]> {
  expect(press(view, 'Enter', { altKey: true })).toBe(true);
  return vi.waitFor(() => {
    const rows = [...view.dom.querySelectorAll('.cm-lsp-action, .cm-lsp-actions-divider')];
    expect(rows.length).toBeGreaterThan(0);
    return rows.map((row) => (row.classList.contains('cm-lsp-actions-divider') ? '-' : (row.textContent ?? '')));
  });
}

describe('serverActions', () => {
  test('lists the quick fixes for the problem at the cursor, then the other actions', async () => {
    const actions = vi.fn((_: CodeActionParams) => [...SOURCE, ADD_IMPORT]);
    const { view } = await open(actions);

    expect(await show(view)).toEqual(['Add import from "./util"', '-', 'Organize imports', 'Sort imports']);
    expect(view.dom.querySelector('.cm-lsp-action-fix')?.textContent).toBe('Add import from "./util"');
    expect(actions.mock.calls[0][0].context.diagnostics).toMatchObject([{ code: 2304, source: 'ts' }]);
  });

  test('shows the code quoted in backticks in a title as code', async () => {
    const { view } = await open(() => [{ ...ADD_IMPORT, title: 'Import `shout` from `./util`' }]);

    expect(await show(view)).toEqual(['Import shout from ./util']);
    const row = view.dom.querySelector('.cm-lsp-action > span') as HTMLElement;
    expect([...row.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['shout', './util']);
  });

  test('applies the selected action on Enter, in one undo step', async () => {
    const { view } = await open(() => [ADD_IMPORT, ...SOURCE]);
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('moves the selection with the arrows, and closes on Escape', async () => {
    const { view } = await open(() => [ADD_IMPORT, ...SOURCE]);
    await show(view);

    press(view, 'ArrowUp');
    expect(view.dom.querySelector('[aria-selected]')?.textContent).toBe('Sort imports');
    expect(press(view, 'Escape')).toBe(true);

    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('applies the preferred fix on Shift-Alt-Enter, without a popup', async () => {
    const other = { ...ADD_IMPORT, title: 'Other fix', isPreferred: false, edit: { changes: {} } };
    const { view } = await open(() => [other, ADD_IMPORT, ...SOURCE]);

    expect(press(view, 'Enter', { altKey: true, shiftKey: true })).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
  });

  test('says when there are no actions', async () => {
    const { view } = await open(() => []);

    press(view, 'Enter', { altKey: true });

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-lsp-actions-message')?.textContent).toBe('No context actions available');
    });
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-actions-message')).toBeNull();
  });

  test('shows nothing on Shift-Alt-Enter when there is no fix', async () => {
    const actions = vi.fn((_: CodeActionParams) => SOURCE);
    const { view } = await open(actions);

    press(view, 'Enter', { altKey: true, shiftKey: true });
    await vi.waitFor(() => expect(actions).toHaveBeenCalledTimes(1));
    await new Promise(requestAnimationFrame);

    expect(view.dom.querySelector('.cm-tooltip')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test("says why the server's actions failed, until the cursor moves", async () => {
    const { view } = await open(() => {
      throw new Error('Server crashed');
    });

    press(view, 'Enter', { altKey: true });

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-lsp-actions-message')?.textContent).toBe('Server crashed');
    });
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('.cm-lsp-actions-message')).toBeNull();
  });

  test('resolves an action without edits before applying it', async () => {
    const { view } = await open(
      () => [{ title: 'Add import from "./util"', kind: 'quickfix', data: { id: 1 } }],
      { codeActionProvider: { resolveProvider: true } },
      { 'codeAction/resolve': (action: object) => ({ ...action, edit: ADD_IMPORT.edit }) },
    );
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
  });

  test("runs an action's command on the server", async () => {
    const { view, stub } = await open(
      () => [{ title: 'Run it', command: 'fix.run', arguments: [1] }],
      {},
      {
        'workspace/executeCommand': () => null,
      },
    );
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => {
      expect(stub.sent.find(({ method }) => method === 'workspace/executeCommand')?.params).toEqual({
        command: 'fix.run',
        arguments: [1],
      });
    });
  });

  test("asks about the line's problems when the cursor isn't on one", async () => {
    const actions = vi.fn((_: CodeActionParams) => [ADD_IMPORT]);
    const { view } = await open(actions);
    view.dispatch({ selection: { anchor: 2 } });

    await show(view);

    expect(actions.mock.calls[0][0].context.diagnostics).toMatchObject([{ code: 2304 }]);
    expect(actions.mock.calls[0][0].range).toEqual(PROBLEM.range);
  });
});
