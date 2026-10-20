import { startCompletion } from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import type { LSPClient } from '@codemirror/lsp-client';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  type CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionTriggerKind,
  type InitializeParams,
} from 'vscode-languageserver-protocol';
import { completion, completionDocumentation } from '@/editor/completion';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { StubTransport } from '../../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const URI = 'file:///worktree/main.rs';

// Returns a transport to a server that completes with `items`, and resolves an item to its `resolved` counterpart.
function transport(items: CompletionItem[], resolved: Record<string, Partial<CompletionItem>> = {}): StubTransport {
  return new StubTransport(
    { textDocumentSync: 2, completionProvider: { triggerCharacters: ['.'], resolveProvider: true } },
    {
      'textDocument/completion': () => items,
      'completionItem/resolve': (item: CompletionItem) => ({ ...item, ...resolved[item.label] }),
    },
  );
}

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `doc` on a running server behind `fake`, with the cursor at its `|`, `extensions` after the rest, and the
// plugin's `hooks` on the server.
async function open(
  fake: StubTransport,
  doc: string,
  extensions: Extension[] = [],
  hooks: Pick<LanguageServer, 'commandHandlers' | 'completionItems'> = {},
): Promise<EditorView> {
  const server: LanguageServer = {
    id: 'rust',
    name: 'Rust',
    languages: { Rust: 'rust' },
    start: () => fake,
    ...hooks,
  };
  const instance = new LanguageServerInstance(server, ROOT);
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: doc.replace('|', ''),
      selection: { anchor: doc.indexOf('|') },
      extensions: [instance.client.plugin(URI, 'rust'), rust, completion(), extensions],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Opens the completions at the cursor, and returns their rows once shown and ready to pick.
async function complete(view: EditorView): Promise<HTMLElement[]> {
  view.focus();
  startCompletion(view);
  const rows = await vi.waitFor(
    () => {
      const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-tooltip-autocomplete li')];
      expect(rows).not.toHaveLength(0);
      return rows;
    },
    { timeout: 2000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  return rows;
}

function press(view: EditorView, key: string): void {
  runScopeHandlers(view, new KeyboardEvent('keydown', { key }), 'editor');
}

function text(row: HTMLElement, selector: string): string | undefined {
  return row.querySelector(selector)?.textContent ?? undefined;
}

describe('serverCompletion', () => {
  test('asks for every kind, deprecation, label details, and resolving documentation and additional edits', async () => {
    const fake = transport([]);
    await open(fake, '|');

    expect((fake.sent[0].params as InitializeParams).capabilities.textDocument?.completion).toMatchObject({
      completionItem: {
        snippetSupport: true,
        deprecatedSupport: true,
        tagSupport: { valueSet: [CompletionItemTag.Deprecated] },
        labelDetailsSupport: true,
        resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
      },
      completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
    });
  });

  test("shows each item's kind as letterform", async () => {
    const view = await open(
      transport([
        { label: 'send', kind: CompletionItemKind.Method },
        { label: 'session', kind: CompletionItemKind.Field },
        { label: 'Session', kind: CompletionItemKind.Struct },
        { label: 'select', kind: CompletionItemKind.Snippet },
        { label: 'sender', kind: CompletionItemKind.Event },
        { label: 'seed' },
      ]),
      'channel.se|',
    );

    const rows = await complete(view);

    expect(
      Object.fromEntries(rows.map((row) => [text(row, '.cm-completionLabel'), text(row, '.cm-completionKind')])),
    ).toEqual({ send: 'm', session: 'p', Session: 'S', select: '{}', sender: 't', seed: '' });
  });

  test('shows label details after label and on right, else detail on right', async () => {
    const view = await open(
      transport([
        { label: 'send', labelDetails: { detail: '(bytes: Bytes)', description: 'Result<()>' }, detail: 'fn send' },
        { label: 'session', detail: 'SessionId' },
      ]),
      'channel.se|',
    );

    const [send, session] = await complete(view);

    expect(text(send, '.cm-completionTail')).toBe('(bytes: Bytes)');
    expect(text(send, '.cm-completionDetail')).toBe('Result<()>');
    expect(text(session, '.cm-completionTail')).toBeUndefined();
    expect(text(session, '.cm-completionDetail')).toBe('SessionId');
  });

  test('marks deprecated items', async () => {
    const view = await open(
      transport([
        { label: 'send' },
        { label: 'send_raw', deprecated: true },
        { label: 'send_slow', tags: [CompletionItemTag.Deprecated] },
      ]),
      'channel.se|',
    );

    const rows = await complete(view);

    expect(rows.map((row) => row.classList.contains('cm-completion-deprecated'))).toEqual([false, true, true]);
  });

  test('shows label of item filtered by other text', async () => {
    const view = await open(transport([{ label: 'set_retries(…)', filterText: 'set_retries' }]), 'channel.se|');

    const [row] = await complete(view);

    expect(text(row, '.cm-completionLabel')).toBe('set_retries(…)');
  });

  test('inserts snippet', async () => {
    const view = await open(
      transport([{ label: 'select', insertText: `select(\${1:x})$0`, insertTextFormat: 2 }]),
      'channel.se|',
    );
    await complete(view);

    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe('channel.select(x)');
  });

  test("makes item's additional edits", async () => {
    const view = await open(
      transport([
        {
          label: 'sequence',
          additionalTextEdits: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
              newText: 'use seq::sequence;\n',
            },
          ],
        },
      ]),
      'se|',
    );
    await complete(view);

    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe('use seq::sequence;\nsequence');
  });

  test("makes snippet's additional edits", async () => {
    const view = await open(
      transport([
        {
          label: 'sequence',
          insertText: `sequence(\${1:x})$0`,
          insertTextFormat: 2,
          additionalTextEdits: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
              newText: 'use seq::sequence;\n',
            },
          ],
        },
      ]),
      'se|',
    );
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('use seq::sequence;\nsequence(x)'));
  });

  test("makes resolved item's additional edits with insertion, undone together", async () => {
    const fake = transport([{ label: 'sequence' }], {
      sequence: {
        detail: 'Update import from "seq"',
        additionalTextEdits: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            newText: 'use seq::sequence;\n',
          },
        ],
      },
    });
    const view = await open(fake, 'se|', [history()]);
    await complete(view);
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-completionInfo')).not.toBeNull());

    press(view, 'Enter');
    const picked = view.state.doc.toString();
    undo(view);

    expect(picked).toBe('use seq::sequence;\nsequence');
    expect(view.state.doc.toString()).toBe('se');
  });

  test('resolves picked item and makes additional edits after insertion', async () => {
    const fake = transport([{ label: 'sequence' }], {
      sequence: {
        additionalTextEdits: [
          {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            newText: 'use seq::sequence;\n',
          },
        ],
      },
    });
    const view = await open(fake, 'se|\n', [completionDocumentation.of(false)]);
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('sequence\nuse seq::sequence;\n'));
    expect(fake.methods).toContain('completionItem/resolve');
  });

  test("resolves selected item's documentation, detail as definition", async () => {
    const fake = transport([{ label: 'send', detail: 'pub fn send(&self)' }], {
      send: { documentation: { kind: 'markdown', value: 'Sends `bytes`.' } },
    });
    const view = await open(fake, 'channel.se|');

    await complete(view);

    const info = await vi.waitFor(
      () => {
        const info = view.dom.querySelector('.cm-completionInfo');
        expect(info?.querySelector('.cm-lsp-content')).not.toBeNull();
        return info as HTMLElement;
      },
      { timeout: 2000 },
    );
    expect(info.querySelector('.cm-lsp-definition pre')?.textContent).toBe('pub fn send(&self)');
    expect(info.querySelector('.cm-lsp-content code')?.textContent).toBe('bytes');
    expect(fake.methods.filter((method) => method === 'completionItem/resolve')).toHaveLength(1);
  });

  test('shows no documentation for item without any', async () => {
    const fake = transport([{ label: 'send' }]);
    const view = await open(fake, 'channel.se|');

    await complete(view);
    await vi.waitFor(() => expect(fake.methods).toContain('completionItem/resolve'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-completionInfo')).toBeNull();
  });

  test('shows no documentation when turned off', async () => {
    const fake = transport([{ label: 'send', detail: 'pub fn send(&self)' }], {
      send: { documentation: { kind: 'markdown', value: 'Sends `bytes`.' } },
    });
    const view = await open(fake, 'channel.se|', [completionDocumentation.of(false)]);

    await complete(view);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(view.dom.querySelector('.cm-completionInfo')).toBeNull();
    expect(fake.methods).not.toContain('completionItem/resolve');
  });

  test('gives items to plugin with request', async () => {
    const completionItems = vi.fn((_client: LSPClient, items: CompletionItem[]) => items);
    const view = await open(transport([{ label: 'send' }]), 'channel.se|', [], { completionItems });

    await complete(view);

    expect(completionItems).toHaveBeenCalledWith(expect.anything(), [{ label: 'send' }], {
      position: { line: 0, character: 10 },
      textDocument: { uri: URI },
      context: { triggerKind: CompletionTriggerKind.Invoked },
    });
  });

  test('shows items plugin returns', async () => {
    const view = await open(transport([{ label: 'send' }, { label: 'session' }]), 'channel.se|', [], {
      completionItems: (_, items) =>
        items.filter(({ label }) => label !== 'session').map((item) => ({ ...item, label: 'send_all' })),
    });

    const rows = await complete(view);

    expect(rows.map((row) => text(row, '.cm-completionLabel'))).toEqual(['send_all']);
  });

  test('awaits items plugin resolves', async () => {
    const view = await open(transport([{ label: 'send' }]), 'channel.se|', [], {
      completionItems: async () => [{ label: 'select' }],
    });

    const rows = await complete(view);

    expect(rows.map((row) => text(row, '.cm-completionLabel'))).toEqual(['select']);
  });

  test('resolves item as plugin returned it', async () => {
    const fake = transport([{ label: 'send' }]);
    const view = await open(fake, 'channel.se|', [], {
      completionItems: (_, items) => items.map((item) => ({ ...item, data: 'marked' })),
    });

    await complete(view);

    await vi.waitFor(() =>
      expect(fake.sent.find(({ method }) => method === 'completionItem/resolve')?.params).toEqual({
        label: 'send',
        data: 'marked',
      }),
    );
  });

  test("runs item's command on server after insertion", async () => {
    const fake = new StubTransport(
      { textDocumentSync: 2, completionProvider: {}, executeCommandProvider: { commands: ['send.hint'] } },
      {
        'textDocument/completion': () => [
          { label: 'send', command: { title: 'Hint', command: 'send.hint', arguments: [1] } },
        ],
        'workspace/executeCommand': () => null,
      },
    );
    const view = await open(fake, 'channel.se|');
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() =>
      expect(fake.sent.find(({ method }) => method === 'workspace/executeCommand')?.params).toEqual({
        command: 'send.hint',
        arguments: [1],
      }),
    );
    const methods = fake.methods;
    expect(methods.lastIndexOf('textDocument/didChange')).toBeLessThan(methods.indexOf('workspace/executeCommand'));
  });

  test("runs item's command with plugin's handler instead", async () => {
    const fake = transport([{ label: 'send' }]);
    let inserted: string | undefined;
    const hint = vi.fn((_client: LSPClient, view: EditorView) => {
      inserted = view.state.doc.toString();
    });
    const view = await open(fake, 'channel.se|', [], {
      completionItems: (_, items) =>
        items.map((item) => ({ ...item, command: { title: 'Hint', command: 'editor.hint', arguments: [1] } })),
      commandHandlers: { 'editor.hint': hint },
    });
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(hint).toHaveBeenCalledWith(expect.anything(), view, [1]));
    expect(inserted).toBe('channel.send');
    expect(fake.methods).not.toContain('workspace/executeCommand');
  });

  test("runs resolved item's command", async () => {
    const hint = vi.fn();
    const view = await open(
      transport([{ label: 'send' }], { send: { command: { title: 'Hint', command: 'editor.hint' } } }),
      'channel.se|',
      [],
      { commandHandlers: { 'editor.hint': hint } },
    );
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(hint).toHaveBeenCalledWith(expect.anything(), view, []));
  });

  test("runs item's command when resolved without one", async () => {
    const hint = vi.fn();
    const view = await open(
      transport([{ label: 'send', command: { title: 'Hint', command: 'editor.hint' } }], {
        send: { command: undefined },
      }),
      'channel.se|',
      [],
      { commandHandlers: { 'editor.hint': hint } },
    );
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() => expect(hint).toHaveBeenCalledWith(expect.anything(), view, []));
  });

  test('says when command failed', async () => {
    const add = vi.spyOn(toast, 'add');
    const view = await open(
      transport([{ label: 'send', command: { title: 'Hint', command: 'editor.hint' } }]),
      'channel.se|',
      [],
      {
        commandHandlers: {
          'editor.hint': () => {
            throw new Error('No hints');
          },
        },
      },
    );
    await complete(view);

    press(view, 'Enter');

    await vi.waitFor(() =>
      expect(add).toHaveBeenCalledWith({ type: 'error', title: 'Command failed', description: 'No hints' }),
    );
  });
});
