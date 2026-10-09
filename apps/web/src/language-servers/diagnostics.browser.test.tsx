import { forEachDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Diagnostic, DocumentDiagnosticParams, InitializeParams } from 'vscode-languageserver-protocol';
import { problems, pullAllDiagnostics } from '@/language-servers/diagnostics';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { type StubTransport, stubTransport } from '../../test/stub-transport';

const ROOT = new URL('file:///worktree/');
const URI = 'file:///worktree/main.toy';

interface DiagnosticsTransport extends StubTransport {
  /** The diagnostic requests sent to the server, in order. */
  readonly requests: DiagnosticRequest[];
}

interface DiagnosticRequest {
  readonly uri: string;
  /** Answers with diagnostics on the first line, each from `[from, to)` with a severity and tags. */
  answer(items: [from: number, to: number, severity: number, tags?: number[]][]): void;
  /** Answers with `items` as they are. */
  reply(items: Diagnostic[]): void;
}

// Returns a transport to a server that offers diagnostics, unless `diagnostics` is false.
function transport(diagnostics = true): DiagnosticsTransport {
  const requests: DiagnosticRequest[] = [];
  const stub = stubTransport(
    { textDocumentSync: 2, ...(diagnostics && { diagnosticProvider: {} }) },
    {
      'textDocument/diagnostic': ({ textDocument }: DocumentDiagnosticParams) =>
        new Promise((resolve) =>
          requests.push({
            uri: textDocument.uri,
            answer: (items) =>
              resolve({
                kind: 'full',
                items: items.map(([from, to, severity, tags]) => ({
                  range: { start: { line: 0, character: from }, end: { line: 0, character: to } },
                  severity,
                  tags,
                  message: `${from}-${to}`,
                })),
              }),
            reply: (items) => resolve({ kind: 'full', items }),
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

// Opens `uri` on `instance` in a new editor.
function open(instance: LanguageServerInstance, uri = URI): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: 'let bad = 1', extensions: instance.client.plugin(uri, 'toy') }),
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
  test('requests diagnostics for a file that opens on a running server, and shows them by severity', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    await instance.start();
    await instance.client.initializing;
    const view = open(instance);

    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));

    fake.requests[0].answer([
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
    fake.requests[0].answer([
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
    fake.requests[0].answer([
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

  test('asks for markdown messages and links to their codes', async () => {
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

  test('underlines the word at a problem reported at a point, or else a character beside it', async () => {
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

  test('requests them again after an edit, once the edit is synced', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].answer([]);
    view.dispatch({ changes: { from: 0, insert: 'x' } });

    await vi.waitFor(() => expect(fake.requests).toHaveLength(2));

    expect(fake.methods.slice(-2)).toEqual(['textDocument/didChange', 'textDocument/diagnostic']);
  });

  test('maps the diagnostics across edits made while the request was in flight', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    view.dispatch({ changes: { from: 0, insert: 'xx' } });
    fake.requests[0].answer([[4, 7, 1]]);

    await vi.waitFor(() => expect(shown(view)).toEqual([[6, 9, 'error']]));
  });

  test('drops the diagnostics for a version that was synced while the request was in flight', async () => {
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
    fake.requests[0].answer([[0, 3, 1]]);
    await settled();

    expect(shown(view)).toEqual([]);
  });

  test('cancels a request that a newer one replaces, and drops its diagnostics', async () => {
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

    fake.requests[0].answer([[0, 1, 1]]);
    fake.requests[1].answer([[0, 2, 2]]);

    await vi.waitFor(() => expect(shown(view)).toEqual([[0, 2, 'warning']]));
  });

  test('never requests diagnostics from a server that does not offer them', async () => {
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

  test('shows the diagnostics a server pushes, keeping the originals', async () => {
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
    expect(view.state.field(problems)).toEqual([{ item, from: 4, to: 7 }]);
  });

  test('syncs an edit for a server that pushes, without asking it', async () => {
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

  test("maps the server's diagnostics through edits, keeping them as the server sent them", async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    fake.requests[0].answer([[4, 7, 1]]);
    await vi.waitFor(() => expect(shown(view)).toHaveLength(1));

    view.dispatch({ changes: { from: 0, insert: '  ' } });

    const [problem] = view.state.field(problems);
    expect([problem.from, problem.to]).toEqual([6, 9]);
    expect(problem.item.range).toEqual({ start: { line: 0, character: 4 }, end: { line: 0, character: 7 } });
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
  test('requests diagnostics for the open files once the server initializes, and again after it restarts', async () => {
    const fakes: DiagnosticsTransport[] = [];
    const instance = new LanguageServerInstance(
      server(() => fakes[fakes.push(transport()) - 1]),
      ROOT,
    );
    const view = open(instance);
    await instance.start();

    await vi.waitFor(() => expect(fakes[0].requests).toHaveLength(1));

    fakes[0].requests[0].answer([[0, 3, 1]]);

    await vi.waitFor(() => expect(shown(view)).toEqual([[0, 3, 'error']]));

    fakes[0].crash();
    await instance.start();

    await vi.waitFor(() => expect(fakes[1]?.requests).toHaveLength(1));
  });
});
