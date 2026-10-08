import { startCompletion } from '@codemirror/autocomplete';
import { history, insertTab, undo } from '@codemirror/commands';
import { HighlightStyle, LanguageDescription, type LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { tags as t } from '@lezer/highlight';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { type CompletionItem, CompletionItemKind, CompletionItemTag } from 'vscode-languageserver-protocol';
import { completionDocumentation } from '@/language-servers/completion';
import { LanguageServerInstance } from '@/language-servers/language-servers';

const ROOT = new URL('file:///worktree/');

const HIGHLIGHT = HighlightStyle.define([
  { tag: t.function(t.propertyName), color: '#102030' },
  { tag: t.propertyName, color: '#405060' },
  { tag: t.typeName, color: '#708090' },
]);
const URI = 'file:///worktree/main.rs';

interface FakeTransport extends LanguageServerTransport {
  /** The methods of the messages sent to the server, in order. */
  readonly sent: string[];
  /** The capabilities the client initialized with. */
  capabilities?: { textDocument?: { completion?: unknown } };
}

// Returns a transport to a server that completes with `items`, and resolves an item to its `resolved` counterpart.
function transport(items: CompletionItem[], resolved: Record<string, Partial<CompletionItem>> = {}): FakeTransport {
  const listeners = new Set<(message: string) => void>();
  const reply = (id: number, result: unknown) => {
    for (const listener of listeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', id, result }));
    }
  };
  const fake: FakeTransport = {
    sent: [],
    send(message) {
      const { id, method, params } = JSON.parse(message);
      fake.sent.push(method);
      if (method === 'initialize') {
        fake.capabilities = params.capabilities;
        reply(id, {
          capabilities: {
            textDocumentSync: 2,
            completionProvider: { triggerCharacters: ['.'], resolveProvider: true },
          },
        });
      } else if (method === 'textDocument/completion') {
        reply(id, items);
      } else if (method === 'completionItem/resolve') {
        reply(id, { ...params, ...resolved[params.label] });
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onClose() {
      return () => {};
    },
    close() {},
  };
  return fake;
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

// Opens `doc` on a running server behind `fake`, with the cursor at its `|`, and `extensions` after the rest.
async function open(fake: FakeTransport, doc: string, extensions: Extension[] = []): Promise<EditorView> {
  const server: LanguageServer = { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => fake };
  const instance = new LanguageServerInstance(server, ROOT);
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: doc.replace('|', ''),
      selection: { anchor: doc.indexOf('|') },
      extensions: [
        instance.client.plugin(URI, 'rust'),
        rust,
        syntaxHighlighting(HIGHLIGHT),
        keymap.of([{ key: 'Tab', run: insertTab }]),
        extensions,
      ],
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

    expect(fake.capabilities?.textDocument?.completion).toMatchObject({
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

  test("shows each item's kind as a tile colored like its syntax", async () => {
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

    const tiles = Object.fromEntries(
      rows.map((row) => {
        const tile = row.querySelector<HTMLElement>('.cm-completionKind');
        const color = getComputedStyle(tile as HTMLElement).color;
        return [
          text(row, '.cm-completionLabel'),
          [tile?.textContent, color === getComputedStyle(row).color ? 'row' : color],
        ];
      }),
    );
    expect(tiles).toEqual({
      send: ['m', 'rgb(16, 32, 48)'],
      session: ['p', 'rgb(64, 80, 96)'],
      Session: ['S', 'rgb(112, 128, 144)'],
      select: ['{}', 'row'],
      sender: ['t', 'row'],
      seed: ['', 'row'],
    });
    expect(view.dom.querySelector('.cm-completionIcon')).toBeNull();
  });

  test('shows the label details after the label and on the right, else the detail on the right', async () => {
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

  test('shows the label of an item filtered by other text', async () => {
    const view = await open(transport([{ label: 'set_retries(…)', filterText: 'set_retries' }]), 'channel.se|');

    const [row] = await complete(view);

    expect(text(row, '.cm-completionLabel')).toBe('set_retries(…)');
  });

  test('inserts a snippet', async () => {
    const view = await open(
      transport([{ label: 'select', insertText: `select(\${1:x})$0`, insertTextFormat: 2 }]),
      'channel.se|',
    );
    await complete(view);

    press(view, 'Enter');

    expect(view.state.doc.toString()).toBe('channel.select(x)');
  });

  test("makes an item's additional edits", async () => {
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

  test("makes a snippet's additional edits", async () => {
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

  test('makes the additional edits of a resolved item with the insertion, undone together', async () => {
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

  test('resolves an item when picked, and makes its additional edits after the insertion', async () => {
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
    expect(fake.sent).toContain('completionItem/resolve');
  });

  test('inserts with Enter and replaces the rest of the word with Tab', async () => {
    const items = [{ label: 'send' }];
    const inserted = await open(transport(items), 'channel.se|lect()');
    await complete(inserted);
    press(inserted, 'Enter');
    const replaced = await open(transport(items), 'channel.se|lect()');
    await complete(replaced);
    press(replaced, 'Tab');

    expect(inserted.state.doc.toString()).toBe('channel.sendlect()');
    expect(replaced.state.doc.toString()).toBe('channel.send()');
  });

  test('leaves Tab to the editor while no completions are open', async () => {
    const view = await open(transport([]), 'se|');

    press(view, 'Tab');

    expect(view.state.doc.toString()).toBe('se\t');
  });

  test("resolves the selected item's documentation, its detail as the definition", async () => {
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
    expect(fake.sent.filter((method) => method === 'completionItem/resolve')).toHaveLength(1);
  });

  test('shows no documentation for an item without any', async () => {
    const fake = transport([{ label: 'send' }]);
    const view = await open(fake, 'channel.se|');

    await complete(view);
    await vi.waitFor(() => expect(fake.sent).toContain('completionItem/resolve'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-completionInfo')).toBeNull();
  });

  test('shows no documentation when it is turned off', async () => {
    const fake = transport([{ label: 'send', detail: 'pub fn send(&self)' }], {
      send: { documentation: { kind: 'markdown', value: 'Sends `bytes`.' } },
    });
    const view = await open(fake, 'channel.se|', [completionDocumentation.of(false)]);

    await complete(view);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(view.dom.querySelector('.cm-completionInfo')).toBeNull();
    expect(fake.sent).not.toContain('completionItem/resolve');
  });
});
