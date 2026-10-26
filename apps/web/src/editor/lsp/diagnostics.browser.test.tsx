import { forEachDiagnostic, type Diagnostic as LintDiagnostic, linter } from '@codemirror/lint';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EditorDiagnostic, LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Diagnostic, DocumentDiagnosticParams, InitializeParams } from 'vscode-languageserver-protocol';
import { pullAllDiagnostics } from '@/editor/lsp/diagnostics';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { StubTransport } from '../../../test/stub-transport';

const ROOT = new URL('file:///worktree/');
const URI = 'file:///worktree/main.toy';

interface DiagnosticsTransport extends StubTransport {
  /** The diagnostic requests sent to the server, in order. */
  readonly requests: DiagnosticRequest[];
}

interface DiagnosticRequest {
  readonly uri: string;
  readonly previousResultId: string | undefined;
  /** Responds with diagnostics on the first line, each from `[from, to)` with a severity and tags, under `resultId`. */
  respond(items: [from: number, to: number, severity: number, tags?: number[]][], resultId?: string): void;
  /** Responds with `items` as they are. */
  reply(items: Diagnostic[]): void;
  /** Responds that nothing changed since `resultId`. */
  unchanged(resultId: string): void;
}

// Returns a transport to a server that offers diagnostics, unless `diagnostics` is false.
function transport(diagnostics = true): DiagnosticsTransport {
  const requests: DiagnosticRequest[] = [];
  const stub = new StubTransport(
    { textDocumentSync: 2, ...(diagnostics && { diagnosticProvider: {} }) },
    {
      'textDocument/diagnostic': ({ textDocument, previousResultId }: DocumentDiagnosticParams) =>
        new Promise((resolve) =>
          requests.push({
            uri: textDocument.uri,
            previousResultId,
            respond: (items, resultId) =>
              resolve({
                kind: 'full',
                resultId,
                items: items.map(([from, to, severity, tags]) => ({
                  range: { start: { line: 0, character: from }, end: { line: 0, character: to } },
                  severity,
                  tags,
                  message: `${from}-${to}`,
                })),
              }),
            reply: (items) => resolve({ kind: 'full', items }),
            unchanged: (resultId) => resolve({ kind: 'unchanged', resultId }),
          }),
        ),
    },
  );
  return Object.assign(stub, { requests });
}

// Returns a language server for the `Toy` language that `start` starts.
function server(start: LanguageServer['start']): LanguageServer {
  return { id: 'toy', name: 'Toy', languages: { Toy: 'toy' }, start };
}

const views: EditorView[] = [];

// Opens `uri` on `instance` in a new editor, with `doc` and `extensions` in it.
function open(
  instance: LanguageServerInstance,
  uri = URI,
  doc = 'let bad = 1',
  extensions: Extension = [],
): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [instance.client.plugin(uri, 'toy'), extensions] }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Returns the diagnostics shown in `view`.
function shown(view: EditorView): [from: number, to: number, severity: string][] {
  const result: [number, number, string][] = [];
  forEachDiagnostic(view.state, (diagnostic, from, to) => result.push([from, to, diagnostic.severity]));
  return result;
}

// Returns the server's diagnostics that `view` shows, where they are now.
function served(view: EditorView): [item: Diagnostic | undefined, from: number, to: number][] {
  const result: [Diagnostic | undefined, number, number][] = [];
  forEachDiagnostic(view.state, (diagnostic: EditorDiagnostic, from, to) => result.push([diagnostic.lsp, from, to]));
  return result;
}

// Waits for the messages that are in flight to arrive.
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe('serverDiagnostics', () => {
  test('requests diagnostics for file that opens on running server, and shows them by severity', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;
    const view = open(instance);

    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));

    fake.requests[0].respond([
      [0, 3, 1],
      [4, 7, 2],
      [8, 9, 3],
      [10, 11, 4],
    ]);

    await vi.waitFor(() =>
      expect(shown(view)).toEqual([
        [0, 3, 'error'],
        [4, 7, 'warning'],
        [8, 9, 'info'],
        [10, 11, 'hint'],
      ]),
    );
  });

  test('marks deprecated code', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].respond([
      [0, 3, 4, [2]],
      [4, 7, 4],
    ]);

    await vi.waitFor(() =>
      expect([...view.contentDOM.querySelectorAll('.cm-lintRange-deprecated')].map((mark) => mark.textContent)).toEqual(
        ['let'],
      ),
    );
  });

  test('marks unnecessary code', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].respond([
      [0, 3, 4, [1]],
      [4, 7, 4, [1, 2]],
      [8, 9, 4],
    ]);

    await vi.waitFor(() =>
      expect(
        [...view.contentDOM.querySelectorAll('.cm-lintRange-unnecessary')].map((mark) => [
          mark.textContent,
          mark.classList.contains('cm-lintRange-deprecated'),
        ]),
      ).toEqual([
        ['let', false],
        [view.state.sliceDoc(4, 7), true],
      ]),
    );
  });

  test('asks for markdown messages and code links', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;

    expect((fake.sent[0].params as InitializeParams).capabilities).toMatchObject({
      textDocument: { diagnostic: { markupMessageSupport: true, codeDescriptionSupport: true } },
    });
  });

  test('underlines word at point diagnostic, else adjacent character', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const point = (character: number) => ({ start: { line: 0, character }, end: { line: 0, character } });

    fake.requests[0].reply([
      { range: point(7), severity: 1, message: 'after bad' },
      { range: point(8), severity: 1, message: 'before =' },
      { range: point(11), severity: 1, message: 'at the end' },
    ]);

    await vi.waitFor(() => {
      expect(shown(view)).toEqual([
        [4, 7, 'error'],
        [8, 9, 'error'],
        [10, 11, 'error'],
      ]);
    });
  });

  test('underlines last character before diagnostic on empty line', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance, URI, 'let list = [1,\n\n');
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const point = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 0 } });

    fake.requests[0].reply([
      { range: point(1), severity: 1, message: 'on a blank line' },
      { range: point(2), severity: 1, message: "']' expected" },
    ]);

    await vi.waitFor(() => {
      expect(shown(view)).toEqual([
        [13, 14, 'error'],
        [13, 14, 'error'],
      ]);
    });
  });

  test('re-requests after edit once synced', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].respond([]);
    view.dispatch({ changes: { from: 0, insert: 'x' } });

    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));

    expect(fake.methods.slice(-2)).toEqual(['textDocument/didChange', 'textDocument/diagnostic']);
  });

  test('maps diagnostics across edits made during request', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    view.dispatch({ changes: { from: 0, insert: 'xx' } });
    fake.requests[0].respond([[4, 7, 1]]);

    await vi.waitFor(() => expect(shown(view)).toEqual([[6, 9, 'error']]));
  });

  test('drops diagnostics for version synced during request', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    view.dispatch({ changes: { from: 0, insert: 'xx' } });
    instance.client.sync();
    fake.requests[0].respond([[0, 3, 1]]);
    await settled();

    expect(shown(view)).toEqual([]);
  });

  test('cancels superseded request and drops diagnostics', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));

    expect(fake.methods).toContain('$/cancelRequest');

    fake.requests[0].respond([[0, 1, 1]]);
    fake.requests[1].respond([[0, 2, 2]]);

    await vi.waitFor(() => expect(shown(view)).toEqual([[0, 2, 'warning']]));
  });

  test('sends last result id, and keeps diagnostics on unchanged', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    expect(fake.requests[0].previousResultId).toBeUndefined();
    fake.requests[0].respond([[4, 7, 1]], 'first');
    await vi.waitFor(() => expect(shown(view)).toEqual([[4, 7, 'error']]));
    view.dispatch({ changes: { from: 0, insert: 'xx' } });
    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));

    expect(fake.requests[1].previousResultId).toBe('first');

    fake.requests[1].unchanged('first');
    await settled();

    expect(shown(view)).toEqual([[6, 9, 'error']]);
  });

  test('never requests diagnostics from server without them', async () => {
    const fake = transport(false);
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await instance.client.initializing;
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(fake.methods).toContain('textDocument/didOpen');
    expect(fake.requests).toEqual([]);
  });

  test('shows diagnostics server pushes, keeping originals', async () => {
    const fake = transport(false);
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await instance.client.initializing;
    const item = {
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
      severity: 2,
      message: 'unused `bad`',
      source: 'toy',
      code: 7,
    };

    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item] });

    await vi.waitFor(() => expect(shown(view)).toEqual([[4, 7, 'warning']]));
    expect(served(view)).toEqual([[item, 4, 7]]);
  });

  test('syncs edit for server that pushes, without asking it', async () => {
    const fake = transport(false);
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await instance.client.initializing;

    view.dispatch({ changes: { from: 0, insert: ' ' } });

    await vi.waitFor(() => expect(fake.methods).toContain('textDocument/didChange'), { timeout: 2000 });
    expect(fake.requests).toEqual([]);
  });

  test('maps pushed diagnostics through edits, keeping originals', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].respond([[4, 7, 1]]);
    await vi.waitFor(() => expect(shown(view)).toHaveLength(1));

    view.dispatch({ changes: { from: 0, insert: '  ' } });

    const [[item, from, to]] = served(view);
    expect([from, to]).toEqual([6, 9]);
    expect(item?.range).toEqual({ start: { line: 0, character: 4 }, end: { line: 0, character: 7 } });
  });
});

describe('serverDiagnostics with linter', () => {
  // The plugin linter's diagnostic, on `let`.
  const LINTED: LintDiagnostic = { from: 0, to: 3, severity: 'info', message: 'plugin' };

  // The server's diagnostic on `bad`, pushed as `message`.
  const item = (message: string) => ({
    range: { start: { line: 0, character: 4 }, end: { line: 0, character: 7 } },
    severity: 2,
    message,
  });

  // Opens the file on a server that pushes diagnostics, beside a plugin linter that finds `linted`.
  async function start(linted: { current: LintDiagnostic[] }) {
    const fake = transport(false);
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(
      instance,
      URI,
      'let bad = 1',
      linter(() => linted.current, { delay: 10 }),
    );
    await instance.start();
    await instance.client.initializing;
    return { fake, view };
  }

  // Returns the messages of the diagnostics shown in `view`.
  const messages = (view: EditorView) => {
    const result: string[] = [];
    forEachDiagnostic(view.state, (diagnostic) => result.push(diagnostic.message));
    return result;
  };

  test('keeps linter diagnostics on server report', async () => {
    const { fake, view } = await start({ current: [LINTED] });
    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin']));

    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item('server')] });

    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin', 'server']));
  });

  test('keeps server diagnostics on linter rerun', async () => {
    const linted = { current: [] as LintDiagnostic[] };
    const { fake, view } = await start(linted);
    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item('server')] });
    await vi.waitFor(() => expect(messages(view)).toEqual(['server']));

    linted.current = [{ ...LINTED, from: 1, to: 4 }];
    view.dispatch({ changes: { from: 0, insert: ' ' } });

    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin', 'server']));
    expect(shown(view)).toEqual([
      [1, 4, 'info'],
      [5, 8, 'warning'],
    ]);
  });

  test('replaces only server diagnostics on report', async () => {
    const { fake, view } = await start({ current: [LINTED] });
    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin']));

    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item('first')] });
    await vi.waitFor(() => expect(messages(view)).toContain('first'));
    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item('second')] });

    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin', 'second']));
  });

  test('clears only server diagnostics on empty report', async () => {
    const { fake, view } = await start({ current: [LINTED] });
    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin']));
    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [item('server')] });
    await vi.waitFor(() => expect(messages(view)).toContain('server'));

    fake.notify('textDocument/publishDiagnostics', { uri: URI, diagnostics: [] });

    await vi.waitFor(() => expect(messages(view)).toEqual(['plugin']));
  });
});

describe('pullAllDiagnostics', () => {
  test('requests diagnostics for every open file', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;
    open(instance, 'file:///worktree/first.toy');
    open(instance, 'file:///worktree/second.toy');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));
    pullAllDiagnostics(instance.client);

    await vi.waitFor(() => expect(fake.requests).toHaveLength(4));

    expect(fake.requests.slice(2).map((request) => request.uri)).toEqual([
      'file:///worktree/first.toy',
      'file:///worktree/second.toy',
    ]);
  });
});

describe('LanguageServerInstance.start', () => {
  test('requests diagnostics for open files on initialize and restart', async () => {
    const fakes: DiagnosticsTransport[] = [];
    const instance = new LanguageServerInstance(
      server(() => fakes[fakes.push(transport()) - 1]),
      ROOT,
    );
    open(instance);
    await instance.start();

    await vi.waitFor(() => expect(fakes[0].requests).toHaveLength(1));

    fakes[0].crash();
    await instance.start();

    await vi.waitFor(() => expect(fakes[1]?.requests).toHaveLength(1));
  });

  test('re-requests diagnostics for open files on refresh', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;
    open(instance, 'file:///worktree/first.toy');
    open(instance, 'file:///worktree/second.toy');
    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));

    expect(await fake.request('workspace/diagnostic/refresh', null)).toEqual({ result: null });

    await vi.waitFor(() => expect(fake.requests).toHaveLength(4));
    expect(fake.requests.slice(2).map((request) => request.uri)).toEqual([
      'file:///worktree/first.toy',
      'file:///worktree/second.toy',
    ]);
  });
});
