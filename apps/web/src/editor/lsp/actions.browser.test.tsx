import { history, undo } from '@codemirror/commands';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { commandsExtension } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

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

// Opens `DOC` with the cursor in `shout`, on a server with `PROBLEM` that answers code actions with `actions`, and the
// plugin's `commandHandlers`.
async function open(
  actions: (params: CodeActionParams) => unknown,
  capabilities: object = {},
  answers: ConstructorParameters<typeof StubTransport>[1] = {},
  commandHandlers: LanguageServer['commandHandlers'] = {},
): Promise<{ view: EditorView; stub: StubTransport }> {
  const stub = new StubTransport(
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
      commandHandlers,
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: 16 },
      extensions: [instance.client.plugin(URI, 'typescript'), commandsExtension(), history()],
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
  test('lists quick fixes for problem at cursor, then other actions', async () => {
    const actions = vi.fn((_: CodeActionParams) => [...SOURCE, ADD_IMPORT]);
    const { view } = await open(actions);

    expect(await show(view)).toEqual(['Add import from "./util"', '-', 'Organize imports', 'Sort imports']);
    expect(view.dom.querySelector('.cm-lsp-action-fix')?.textContent).toBe('Add import from "./util"');
    expect(actions.mock.calls[0][0].context.diagnostics).toMatchObject([{ code: 2304, source: 'ts' }]);
  });

  test('renders backticks in title as code', async () => {
    const { view } = await open(() => [{ ...ADD_IMPORT, title: 'Import `shout` from `./util`' }]);

    expect(await show(view)).toEqual(['Import shout from ./util']);
    const row = view.dom.querySelector('.cm-lsp-action > span') as HTMLElement;
    expect([...row.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['shout', './util']);
  });

  test('applies selected action on Enter, in one undo step', async () => {
    const { view } = await open(() => [ADD_IMPORT, ...SOURCE]);
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('moves selection with arrows, and closes on Escape', async () => {
    const { view } = await open(() => [ADD_IMPORT, ...SOURCE]);
    await show(view);

    press(view, 'ArrowUp');
    expect(view.dom.querySelector('[aria-selected]')?.textContent).toBe('Sort imports');
    expect(press(view, 'Escape')).toBe(true);

    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('applies preferred fix on Shift-Alt-Enter, without popup', async () => {
    const other = { ...ADD_IMPORT, title: 'Other fix', isPreferred: false, edit: { changes: {} } };
    const { view } = await open(() => [other, ADD_IMPORT, ...SOURCE]);

    expect(press(view, 'Enter', { altKey: true, shiftKey: true })).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
  });

  test('says when no actions', async () => {
    const { view } = await open(() => []);

    press(view, 'Enter', { altKey: true });

    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-lsp-actions-message')?.textContent).toBe('No context actions available');
    });
    expect(view.dom.querySelector('.cm-lsp-actions')).toBeNull();
    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-actions-message')).toBeNull();
  });

  test('shows nothing on Shift-Alt-Enter without fix', async () => {
    const actions = vi.fn((_: CodeActionParams) => SOURCE);
    const { view } = await open(actions);

    press(view, 'Enter', { altKey: true, shiftKey: true });
    await vi.waitFor(() => expect(actions).toHaveBeenCalledTimes(1));
    await new Promise(requestAnimationFrame);

    expect(view.dom.querySelector('.cm-tooltip')).toBeNull();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test("doesn't show or apply actions in read-only document", async () => {
    const actions = vi.fn((_: CodeActionParams) => [ADD_IMPORT]);
    const { view } = await open(actions);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });

    expect(press(view, 'Enter', { altKey: true })).toBe(false);
    expect(press(view, 'Enter', { altKey: true, shiftKey: true })).toBe(false);
    await new Promise(requestAnimationFrame);

    expect(actions).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test("says why server's actions failed, until cursor moves", async () => {
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

  test('resolves action without edits before applying', async () => {
    const { view } = await open(
      () => [{ title: 'Add import from "./util"', kind: 'quickfix', data: { id: 1 } }],
      { codeActionProvider: { resolveProvider: true } },
      { 'codeAction/resolve': (action: object) => ({ ...action, edit: ADD_IMPORT.edit }) },
    );
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
  });

  test("runs action's command on server", async () => {
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

  test("runs action's command with plugin's handler instead", async () => {
    const run = vi.fn();
    const { view, stub } = await open(
      () => [{ title: 'Run it', command: 'fix.run', arguments: [1] }],
      {},
      {},
      { 'fix.run': run },
    );
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(expect.anything(), view, [1]));
    expect(stub.methods).not.toContain('workspace/executeCommand');
  });

  test("applies command's edit in one undo step", async () => {
    let server: StubTransport | undefined;
    let response: Promise<unknown> | undefined;
    const { view, stub } = await open(
      () => [{ title: 'Add import from "./util"', command: 'fix.import' }],
      {},
      {
        'workspace/executeCommand': async () => {
          response = server?.request('workspace/applyEdit', { edit: ADD_IMPORT.edit });
          await response;
          return null;
        },
      },
    );
    server = stub;
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(IMPORT + DOC));
    expect(await response).toEqual({ result: { applied: true } });
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('says why edit to unopened file failed, applying none', async () => {
    const execute = vi.fn(() => null);
    const edit = {
      changes: {
        ...ADD_IMPORT.edit.changes,
        'file:///worktree/util.ts': [{ range: PROBLEM.range, newText: 'export ' }],
      },
    };
    const { view } = await open(
      () => [{ ...ADD_IMPORT, edit, command: { title: 'Then', command: 'fix.then' } }],
      {},
      { 'workspace/executeCommand': execute },
    );
    await show(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.dom.querySelector('.cm-lsp-actions-message')).not.toBeNull());
    expect(view.state.doc.toString()).toBe(DOC);
    expect(execute).not.toHaveBeenCalled();
  });

  test("asks about line's problems when cursor isn't on one", async () => {
    const actions = vi.fn((_: CodeActionParams) => [ADD_IMPORT]);
    const { view } = await open(actions);
    view.dispatch({ selection: { anchor: 2 } });

    await show(view);

    expect(actions.mock.calls[0][0].context.diagnostics).toMatchObject([{ code: 2304 }]);
    expect(actions.mock.calls[0][0].range).toEqual(PROBLEM.range);
  });
});
