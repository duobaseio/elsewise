import { forEachDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { pullAllDiagnostics } from '@/language-servers/diagnostics';
import { LanguageServerInstance } from '@/language-servers/language-servers';

const ROOT = new URL('file:///worktree/');
const URI = 'file:///worktree/main.toy';

interface FakeTransport extends LanguageServerTransport {
  /** The methods of the messages sent to the server, in order. */
  readonly sent: string[];
  /** The client's capabilities, once it initializes. */
  capabilities?: unknown;
  /** The diagnostic requests sent to the server, in order. */
  readonly requests: DiagnosticRequest[];
  /** Closes the connection as a server that crashed would. */
  crash(): void;
}

interface DiagnosticRequest {
  readonly id: number;
  readonly uri: string;
  /** Answers with diagnostics on the first line, each from `[from, to)` with a severity and tags. */
  answer(items: [from: number, to: number, severity: number, tags?: number[]][]): void;
  /** Answers with `items` as they are. */
  reply(items: Diagnostic[]): void;
}

// Returns a transport to a server that offers diagnostics, unless `diagnostics` is false.
function transport(diagnostics = true): FakeTransport {
  const messageListeners = new Set<(message: string) => void>();
  const closeListeners = new Set<() => void>();
  const reply = (id: number, result: unknown) => {
    for (const listener of messageListeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', id, result }));
    }
  };
  const fake: FakeTransport = {
    sent: [],
    requests: [],
    send(message) {
      const { id, method, params } = JSON.parse(message);
      fake.sent.push(method);
      if (method === 'initialize') {
        fake.capabilities = params.capabilities;
        reply(id, { capabilities: { textDocumentSync: 2, ...(diagnostics && { diagnosticProvider: {} }) } });
      } else if (method === 'textDocument/diagnostic') {
        fake.requests.push({
          id,
          uri: params.textDocument.uri,
          answer: (items) =>
            reply(id, {
              kind: 'full',
              items: items.map(([from, to, severity, tags]) => ({
                range: { start: { line: 0, character: from }, end: { line: 0, character: to } },
                severity,
                tags,
                message: `${from}-${to}`,
              })),
            }),
          reply: (items) => reply(id, { kind: 'full', items }),
        });
      }
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close() {
      fake.crash();
    },
    crash() {
      for (const listener of closeListeners) {
        listener();
      }
    },
  };
  return fake;
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

// Returns the diagnostic messages shown in `view`, rendered.
function rendered(view: EditorView): HTMLElement[] {
  const result: HTMLElement[] = [];
  forEachDiagnostic(view.state, (diagnostic) => {
    const element = document.createElement('div');
    element.append(diagnostic.renderMessage?.(view) ?? diagnostic.message);
    result.push(element);
  });
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

describe('pullDiagnostics', () => {
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

    expect(fake.capabilities).toMatchObject({
      textDocument: { diagnostic: { markupMessageSupport: true, codeDescriptionSupport: true } },
    });
  });

  test('renders a markdown message', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } };
    fake.requests[0].reply([
      { range, message: { kind: 'markdown', value: 'use `send`, see [docs](https://example.com)' } },
    ]);

    await vi.waitFor(() => expect(rendered(view)).toHaveLength(1));

    const [message] = rendered(view);
    expect(message.querySelector('.cm-diagnosticMessage code')?.textContent).toBe('send');
    expect(message.querySelector('.cm-diagnosticMessage a')?.getAttribute('href')).toBe('https://example.com');
    expect(shown(view)).toEqual([[0, 3, 'error']]);
  });

  test('renders the code a plain message quotes in backticks, and the rest as it is', async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } };
    fake.requests[0].reply([{ range, message: 'expected `*const T`, found <b>_x_</b> and an odd `' }]);

    await vi.waitFor(() => expect(rendered(view)).toHaveLength(1));

    const message = rendered(view)[0].querySelector('.cm-diagnosticMessage');
    expect([...(message?.querySelectorAll('code') ?? [])].map((code) => code.textContent)).toEqual(['*const T']);
    expect(message?.querySelector('b')).toBeNull();
    expect(message?.textContent).toBe('expected *const T, found <b>_x_</b> and an odd `');
  });

  test("shows the message's source and code, linking the code to its description", async () => {
    const fake = transport();
    const instance = new LanguageServerInstance(
      server(() => fake),
      ROOT,
    );
    const view = open(instance);
    await instance.start();
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } };
    fake.requests[0].reply([
      {
        range,
        message: 'linked',
        source: 'rustc',
        code: 'E0425',
        codeDescription: { href: 'https://example.com/E0425' },
      },
      { range, message: 'code', code: 2322 },
      { range, message: 'unsafe', code: 'x', codeDescription: { href: 'javascript:alert(1)' } },
      { range, message: 'bare' },
    ]);

    await vi.waitFor(() => expect(rendered(view)).toHaveLength(4));

    const metas = rendered(view).map((message) => message.querySelector('.cm-diagnosticMeta'));
    expect(metas.map((meta) => meta?.textContent)).toEqual(['rustc · E0425', '2322', 'x', undefined]);
    expect(metas[0]?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/E0425');
    expect(metas[1]?.querySelector('a')).toBeNull();
    expect(metas[2]?.querySelector('a')).toBeNull();
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

    expect(fake.sent.slice(-2)).toEqual(['textDocument/didChange', 'textDocument/diagnostic']);
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

    expect(fake.sent).toContain('$/cancelRequest');

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

    expect(fake.sent).toContain('textDocument/didOpen');
    expect(fake.requests).toEqual([]);
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
    const fakes: FakeTransport[] = [];
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
