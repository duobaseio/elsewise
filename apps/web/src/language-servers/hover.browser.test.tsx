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

// Returns a transport to a server that answers every hover with `hover`, and offers no hovers if it is undefined. It
// finds `diagnostics`, and answers code actions with `actions`.
function transport(
  hover: Hover | null | undefined,
  diagnostics: Diagnostic[] = [],
  actions: () => unknown = () => [],
): StubTransport {
  return stubTransport(
    {
      textDocumentSync: 2,
      diagnosticProvider: {},
      codeActionProvider: true,
      ...(hover !== undefined && { hoverProvider: true }),
    },
    {
      'textDocument/hover': () => hover,
      'textDocument/diagnostic': () => ({ kind: 'full', items: diagnostics }),
      'textDocument/codeAction': actions,
    },
  );
}

// The problem with `attach`, and a fix for it.
const PROBLEM: Diagnostic = {
  range: { start: { line: 0, character: 14 }, end: { line: 0, character: 20 } },
  severity: 1,
  message: 'cannot find `attach`',
};
const FIX = {
  title: 'Rename to `connect`',
  kind: 'quickfix',
  edit: { changes: { [URI]: [{ range: PROBLEM.range, newText: 'connect' }] } },
};

// Points at `attach` and returns the hover once it shows a problem, with what it showed when it first appeared.
async function hoverProblem(view: EditorView): Promise<{ tooltip: HTMLElement; first: Element | null }> {
  await vi.waitFor(() => expect(view.contentDOM.querySelector('.cm-lintRange-error')).not.toBeNull());
  let first: Element | null = null;
  const observer = new MutationObserver(() => {
    first ??= view.dom.querySelector('.cm-tooltip-hover')?.cloneNode(true) as Element | null;
  });
  observer.observe(view.dom, { childList: true, subtree: true });
  point(view, DOC.indexOf('attach') + 1);
  const tooltip = await vi.waitFor(
    () => {
      expect(view.dom.querySelector('.cm-tooltip-hover .cm-diagnostic')).not.toBeNull();
      return view.dom.querySelector('.cm-tooltip-hover') as HTMLElement;
    },
    { timeout: 2000 },
  );
  observer.disconnect();
  return { tooltip, first };
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

  test('shows the problems with their fixes and the documentation at once', async () => {
    const view = await open(
      transport(
        markdown('Attaches.'),
        [PROBLEM],
        () => new Promise((resolve) => setTimeout(() => resolve([FIX]), 100)),
      ),
    );

    const { first } = await hoverProblem(view);

    expect(first?.querySelectorAll('.cm-tooltip-section')).toHaveLength(2);
    expect(first?.querySelector('.cm-lsp-actions-hover')?.textContent).toContain('Rename to connect');
  });

  test("names a problem's top fix and the rest, and applies the fix when clicked", async () => {
    const view = await open(
      transport(null, [PROBLEM], () => [{ title: 'Organize imports', kind: 'source.organizeImports' }, FIX]),
    );

    const { tooltip } = await hoverProblem(view);

    const line = tooltip.querySelector('.cm-lsp-actions-hover') as HTMLElement;
    expect([...line.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Rename to connect',
      'More actions',
    ]);
    expect(line.querySelector('button code')?.textContent).toBe('connect');
    expect(line.querySelectorAll('kbd')).toHaveLength(2);
    line.querySelector('button')?.click();
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let channel = connect(1);'));
  });

  test('shows a problem without a line for fixes when the server has none', async () => {
    const view = await open(transport(null, [PROBLEM]));

    const { tooltip } = await hoverProblem(view);

    expect(tooltip.querySelector('.cm-diagnosticMessage')?.textContent).toBe('cannot find attach');
    expect(tooltip.querySelector('.cm-lsp-actions-hover')).toBeNull();
  });

  test("shows a problem without its fixes rather than waiting long for a server that doesn't answer", async () => {
    const view = await open(transport(null, [PROBLEM], () => new Promise(() => {})));

    const { tooltip } = await hoverProblem(view);

    expect(tooltip.querySelector('.cm-diagnosticMessage')?.textContent).toBe('cannot find attach');
    expect(tooltip.querySelector('.cm-lsp-actions-hover')).toBeNull();
  });

  test("renders a problem's markdown message", async () => {
    const view = await open(
      transport(null, [
        { ...PROBLEM, message: { kind: 'markdown', value: 'use `send`, see [docs](https://example.com)' } },
      ]),
    );

    const { tooltip } = await hoverProblem(view);

    expect(tooltip.querySelector('.cm-diagnosticMessage code')?.textContent).toBe('send');
    expect(tooltip.querySelector('.cm-diagnosticMessage a')?.getAttribute('href')).toBe('https://example.com');
  });

  test('renders the code a plain message quotes in backticks, and the rest as it is', async () => {
    const view = await open(
      transport(null, [{ ...PROBLEM, message: 'expected `*const T`, found <b>_x_</b> and an odd `' }]),
    );

    const { tooltip } = await hoverProblem(view);

    const message = tooltip.querySelector('.cm-diagnosticMessage');
    expect([...(message?.querySelectorAll('code') ?? [])].map((code) => code.textContent)).toEqual(['*const T']);
    expect(message?.querySelector('b')).toBeNull();
    expect(message?.textContent).toBe('expected *const T, found <b>_x_</b> and an odd `');
  });

  test("shows a problem's source and code, linking the code to its description", async () => {
    const view = await open(
      transport(null, [
        {
          ...PROBLEM,
          message: 'linked',
          source: 'rustc',
          code: 'E0425',
          codeDescription: { href: 'https://example.com/E0425' },
        },
        { ...PROBLEM, message: 'code', code: 2322 },
        { ...PROBLEM, message: 'unsafe', code: 'x', codeDescription: { href: 'javascript:alert(1)' } },
        { ...PROBLEM, message: 'bare' },
      ]),
    );

    const { tooltip } = await hoverProblem(view);

    const metas = [...tooltip.querySelectorAll('.cm-diagnostic')].map((problem) =>
      problem.querySelector('.cm-diagnosticMeta'),
    );
    expect(metas.map((meta) => meta?.textContent)).toEqual(['rustc · E0425', '2322', 'x', undefined]);
    expect(metas[0]?.querySelector('a')?.getAttribute('href')).toBe('https://example.com/E0425');
    expect(metas[1]?.querySelector('a')).toBeNull();
    expect(metas[2]?.querySelector('a')).toBeNull();
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
