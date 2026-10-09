import {
  defaultHighlightStyle,
  LanguageDescription,
  type LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Diagnostic, Hover } from 'vscode-languageserver-protocol';
import { highlightUsages } from '@/language-servers/highlights';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { type StubTransport, stubTransport } from '../../test/stub-transport';

const ROOT = new URL('file:///worktree/');
const URI = 'file:///worktree/main.rs';
const DOC = 'let channel = attach(1);';

// Returns a transport to a server that answers every hover with `hover`, and offers no hovers if it is undefined.
function transport(hover: Hover | null | undefined, diagnostics: Diagnostic[] = []): StubTransport {
  return stubTransport(
    { textDocumentSync: 2, diagnosticProvider: {}, ...(hover !== undefined && { hoverProvider: true }) },
    {
      'textDocument/hover': () => hover,
      'textDocument/diagnostic': () => ({ kind: 'full', items: diagnostics }),
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

// Opens a Rust file with `extensions` on a running server behind `fake`.
async function open(fake: StubTransport, extensions: Extension = []): Promise<EditorView> {
  const server: LanguageServer = { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => fake };
  const instance = new LanguageServerInstance(server, ROOT);
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [instance.client.plugin(URI, 'rust'), rust, syntaxHighlighting(defaultHighlightStyle), extensions],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Moves the pointer over `pos` in `view`, with `init`'s buttons held.
function point(view: EditorView, pos: number, init: MouseEventInit = {}): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true, ...init }));
}

// Clicks `pos` in `view` without moving the pointer.
function press(view: EditorView, pos: number): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  const target = document.elementFromPoint(x, y);
  target?.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, buttons: 1 }));
  target?.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
}

// Waits past the delay before a hover opens.
function rest(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600));
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
    await vi.waitFor(() => expect(fake.methods).toContain('textDocument/hover'), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('never asks a server that offers no hovers', async () => {
    const fake = transport(undefined);
    const view = await open(fake);

    point(view, DOC.indexOf('attach') + 1);
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(fake.methods).not.toContain('textDocument/hover');
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

  describe('on a click', () => {
    test('closes', async () => {
      const view = await open(transport(markdown('Attaches.')));
      await hover(view);

      press(view, DOC.indexOf('channel'));

      await vi.waitFor(() => expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull());
    });

    test("doesn't open, nor ask the server", async () => {
      const fake = transport(markdown('Attaches.'));
      const view = await open(fake);

      point(view, DOC.indexOf('attach') + 1);
      press(view, DOC.indexOf('attach') + 1);
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
      expect(fake.methods).not.toContain('textDocument/hover');
    });

    test('opens again once the pointer moves', async () => {
      const view = await open(transport(markdown('Attaches.')));
      point(view, DOC.indexOf('attach') + 1);
      press(view, DOC.indexOf('attach') + 1);
      await rest();

      point(view, DOC.indexOf('attach') + 3);

      await vi.waitFor(() => expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull(), { timeout: 2000 });
    });

    test("doesn't open again for a move where the click was", async () => {
      const view = await open(transport(markdown('Attaches.')));
      point(view, DOC.indexOf('attach') + 1);
      press(view, DOC.indexOf('attach') + 1);

      point(view, DOC.indexOf('attach') + 1);
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    });

    test("doesn't open again while dragging", async () => {
      const view = await open(transport(markdown('Attaches.')));
      point(view, DOC.indexOf('attach') + 1);
      press(view, DOC.indexOf('attach') + 1);

      point(view, DOC.indexOf('attach') + 3, { buttons: 1 });
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    });

    test('stays open for a click inside it', async () => {
      const view = await open(transport(markdown('Attaches.')));
      const tooltip = await hover(view);

      tooltip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
    });

    test("doesn't show the problems either", async () => {
      const from = DOC.indexOf('attach');
      const range = { start: { line: 0, character: from }, end: { line: 0, character: from + 6 } };
      const view = await open(transport(null, [{ range, severity: 1, message: 'cannot find `attach`' }]));
      await vi.waitFor(() => expect(view.contentDOM.querySelector('.cm-lintRange-error')).not.toBeNull());

      point(view, from + 1);
      press(view, from + 1);
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
    });
  });

  describe('on a click, with usages not highlighted', () => {
    test('stays open', async () => {
      const view = await open(transport(markdown('Attaches.')), highlightUsages.of(false));
      await hover(view);

      press(view, DOC.indexOf('channel'));
      await rest();

      expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull();
    });

    test('opens', async () => {
      const view = await open(transport(markdown('Attaches.')), highlightUsages.of(false));

      point(view, DOC.indexOf('attach') + 1);
      press(view, DOC.indexOf('attach') + 1);

      await vi.waitFor(() => expect(view.dom.querySelector('.cm-tooltip-hover')).not.toBeNull(), { timeout: 2000 });
    });

    test('shows the problems', async () => {
      const from = DOC.indexOf('attach');
      const range = { start: { line: 0, character: from }, end: { line: 0, character: from + 6 } };
      const view = await open(
        transport(null, [{ range, severity: 1, message: 'cannot find `attach`' }]),
        highlightUsages.of(false),
      );
      await vi.waitFor(() => expect(view.contentDOM.querySelector('.cm-lintRange-error')).not.toBeNull());

      point(view, from + 1);
      press(view, from + 1);

      await vi.waitFor(() => expect(view.dom.querySelector('.cm-tooltip-lint')).not.toBeNull(), { timeout: 2000 });
    });
  });
});
