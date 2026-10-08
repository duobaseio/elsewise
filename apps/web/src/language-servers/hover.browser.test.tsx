import {
  defaultHighlightStyle,
  LanguageDescription,
  type LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Diagnostic, Hover } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/language-servers/language-servers';

const ROOT = new URL('file:///worktree/');
const URI = 'file:///worktree/main.rs';
const DOC = 'let channel = attach(1);';

interface FakeTransport extends LanguageServerTransport {
  /** The methods of the messages sent to the server, in order. */
  readonly sent: string[];
}

// Returns a transport to a server that answers every hover with `hover`, and offers no hovers if it is undefined.
function transport(hover: Hover | null | undefined, diagnostics: Diagnostic[] = []): FakeTransport {
  const listeners = new Set<(message: string) => void>();
  const reply = (id: number, result: unknown) => {
    for (const listener of listeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', id, result }));
    }
  };
  const fake: FakeTransport = {
    sent: [],
    send(message) {
      const { id, method } = JSON.parse(message);
      fake.sent.push(method);
      if (method === 'initialize') {
        reply(id, {
          capabilities: {
            textDocumentSync: 2,
            diagnosticProvider: {},
            ...(hover !== undefined && { hoverProvider: true }),
          },
        });
      } else if (method === 'textDocument/hover') {
        reply(id, hover);
      } else if (method === 'textDocument/diagnostic') {
        reply(id, { kind: 'full', items: diagnostics });
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

// Opens a Rust file on a running server behind `fake`.
async function open(fake: FakeTransport): Promise<EditorView> {
  const server: LanguageServer = { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => fake };
  const instance = new LanguageServerInstance(server, ROOT);
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [instance.client.plugin(URI, 'rust'), rust, syntaxHighlighting(defaultHighlightStyle)],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Moves the pointer over `pos` in `view`.
function point(view: EditorView, pos: number): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

// Points at `attach` and returns the hover that opens.
async function hover(view: EditorView): Promise<HTMLElement> {
  point(view, DOC.indexOf('attach') + 1);
  return vi.waitFor(
    () => {
      const tooltip = view.dom.querySelector<HTMLElement>('.cm-tooltip-hover');
      expect(tooltip).not.toBeNull();
      return tooltip as HTMLElement;
    },
    { timeout: 2000 },
  );
}

function markdown(value: string): Hover {
  return { contents: { kind: 'markdown', value } };
}

describe('serverHover', () => {
  test('shows the code blocks that open the documentation as its highlighted definition, above the rest', async () => {
    const view = await open(
      transport(
        markdown(
          [
            '```rust\nelsewise::session\n```',
            '```rust\npub fn attach(id: u32)\n```',
            '---',
            'Attaches to the session.',
            '- Retries.\n- Fails with `Error`.',
            'See the [guide](https://example.com/guide).',
          ].join('\n\n'),
        ),
      ),
    );

    const tooltip = await hover(view);

    const definition = tooltip.querySelector('.cm-lsp-definition');
    expect([...(definition?.querySelectorAll('pre') ?? [])].map((pre) => pre.textContent)).toEqual([
      'elsewise::session',
      'pub fn attach(id: u32)',
    ]);
    expect(definition?.querySelector('pre:last-child span')).not.toBeNull();
    const content = tooltip.querySelector('.cm-lsp-content');
    expect(definition?.nextElementSibling).toBe(content);
    expect(content?.querySelector('hr')).toBeNull();
    expect([...(content?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Retries.',
      'Fails with Error.',
    ]);
    expect(content?.querySelector('code')?.textContent).toBe('Error');
    expect(content?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/guide');
  });

  test('leaves a code block after the prose in the documentation', async () => {
    const view = await open(
      transport(markdown('```rust\nfn attach()\n```\n\nAttaches.\n\n```rust\nlet channel = attach();\n```')),
    );

    const tooltip = await hover(view);

    const definition = tooltip.querySelector('.cm-lsp-definition');
    expect([...(definition?.querySelectorAll('pre') ?? [])].map((pre) => pre.textContent)).toEqual(['fn attach()']);
    expect(tooltip.querySelector('.cm-lsp-content pre')?.textContent).toContain('let channel = attach();');
  });

  test('leaves a code block in another language plain', async () => {
    const view = await open(transport(markdown('```python\ndef attach(): pass\n```\n\nDocs.')));

    const tooltip = await hover(view);

    const pre = tooltip.querySelector('.cm-lsp-definition pre');
    expect(pre?.textContent).toBe('def attach(): pass');
    expect(pre?.querySelector('span')).toBeNull();
  });

  test('shows plain text as it is, without a definition', async () => {
    const view = await open(transport({ contents: { kind: 'plaintext', value: '```rust\nfn x()\n```\n<b>bold</b>' } }));

    const tooltip = await hover(view);

    expect(tooltip.querySelector('.cm-lsp-definition')).toBeNull();
    expect(tooltip.querySelector('.cm-lsp-content b')).toBeNull();
    expect(tooltip.querySelector('.cm-lsp-content')?.textContent).toContain('<b>bold</b>');
  });

  test('shows marked strings, a code string as the definition', async () => {
    const view = await open(transport({ contents: [{ language: 'rust', value: 'fn attach()' }, 'Attaches *now*.'] }));

    const tooltip = await hover(view);

    expect(tooltip.querySelector('.cm-lsp-definition pre')?.textContent).toBe('fn attach()');
    expect(tooltip.querySelector('.cm-lsp-content em')?.textContent).toBe('now');
  });

  test('closes on Escape', async () => {
    const view = await open(transport(markdown('Attaches.')));
    await hover(view);

    const close = () => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Escape' }), 'editor');
    expect(close()).toBe(true);
    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    expect(close()).toBe(false);
  });

  test('shows nothing when the server has no documentation', async () => {
    const fake = transport(null);
    const view = await open(fake);

    point(view, DOC.indexOf('attach') + 1);
    await vi.waitFor(() => expect(fake.sent).toContain('textDocument/hover'), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('never asks a server that offers no hovers', async () => {
    const fake = transport(undefined);
    const view = await open(fake);

    point(view, DOC.indexOf('attach') + 1);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(fake.sent).not.toContain('textDocument/hover');
  });

  test('shows the problems at the pointer above the documentation', async () => {
    const from = DOC.indexOf('attach');
    const range = { start: { line: 0, character: from }, end: { line: 0, character: from + 6 } };
    const view = await open(
      transport(markdown('```rust\nfn attach()\n```'), [{ range, severity: 1, message: 'cannot find `attach`' }]),
    );
    await vi.waitFor(() => expect(view.contentDOM.querySelector('.cm-lintRange-error')).not.toBeNull());

    const tooltip = await hover(view);

    await vi.waitFor(() => expect(tooltip.querySelectorAll('.cm-tooltip-section')).toHaveLength(2));
    const [first, second] = tooltip.querySelectorAll('.cm-tooltip-section');
    expect(first.querySelector('.cm-diagnostic-error')).not.toBeNull();
    expect(second.querySelector('.cm-lsp-definition')).not.toBeNull();
  });
});
