import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { DocumentHighlightParams } from 'vscode-languageserver-protocol';
import { highlightUsages } from '@/language-servers/highlights';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { stubTransport } from '../../test/stub-transport';

const URI = 'file:///worktree/main.rs';

const DOC = 'let total = 1;\ntotal + total;\nlet other = 2;\n// total\nlet text = "total";';

// Where `total` is, by line and character. The first is its declaration.
const TOTALS = [
  [0, 4],
  [1, 0],
  [1, 8],
];

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

// Opens `DOC` with `extensions` on a server with `capabilities` that finds the usages of `total` wherever it's asked,
// `late` ms later, and returns the positions it was asked at.
async function open(
  capabilities: object = { documentHighlightProvider: true },
  late = 0,
  extensions: Extension = [],
): Promise<{ view: EditorView; asked: number[] }> {
  const asked: number[] = [];
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () =>
        stubTransport(capabilities, {
          'textDocument/documentHighlight': ({ position }: DocumentHighlightParams) => {
            asked.push(position.character + position.line * 100);
            const highlights = TOTALS.map(([line, character], i) => ({
              range: { start: { line, character }, end: { line, character: character + 'total'.length } },
              kind: i === 0 ? 3 : 2,
            }));
            return new Promise((resolve) => setTimeout(() => resolve(highlights), late));
          },
        }),
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [instance.client.plugin(URI, 'rust'), EditorState.allowMultipleSelections.of(true), extensions],
    }),
    parent: document.body,
  });
  views.push(view);
  view.focus();
  return { view, asked };
}

function highlighted(view: EditorView): string[] {
  return [...view.dom.querySelectorAll('.cm-lsp-highlight')].map(
    (mark) => `${mark.textContent}${mark.classList.contains('cm-lsp-highlight-write') ? ' (write)' : ''}`,
  );
}

// Waits longer than the delay before the usages are asked for.
function rest(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

describe('serverHighlights', () => {
  test('highlights the usages of the symbol at the caret, marking writes', async () => {
    const { view } = await open();

    view.dispatch({ selection: { anchor: DOC.indexOf('total + ') + 2 } });

    await vi.waitFor(() => expect(highlighted(view)).toEqual(['total (write)', 'total', 'total']));
  });

  test('keeps the highlights while the caret moves within them', async () => {
    const { view, asked } = await open();
    view.dispatch({ selection: { anchor: DOC.indexOf('total + ') + 2 } });
    await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));

    view.dispatch({ selection: { anchor: DOC.indexOf('total + ') + 4 } });
    view.dispatch({ selection: { anchor: 6 } });
    await rest();

    expect(highlighted(view)).toHaveLength(3);
    expect(asked).toHaveLength(1);
  });

  test('clears the highlights at once when the caret leaves them, and asks again', async () => {
    const { view, asked } = await open();
    view.dispatch({ selection: { anchor: 6 } });
    await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));

    view.dispatch({ selection: { anchor: DOC.indexOf('other') + 1 } });

    expect(highlighted(view)).toEqual([]);
    await vi.waitFor(() => expect(asked).toHaveLength(2));
  });

  test('highlights nothing with a selection or several carets', async () => {
    const { view, asked } = await open();

    view.dispatch({ selection: { anchor: 4, head: 9 } });
    await rest();
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(6), EditorSelection.cursor(16)]) });
    await rest();

    expect(highlighted(view)).toEqual([]);
    expect(asked).toEqual([]);
  });

  test('clears the highlights when the document changes', async () => {
    const { view } = await open();
    view.dispatch({ selection: { anchor: 6 } });
    await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));

    view.dispatch({ changes: { from: DOC.length, insert: '\n' } });

    expect(highlighted(view)).toEqual([]);
  });

  test('drops an answer that arrives after the caret moved', async () => {
    const { view, asked } = await open(undefined, 300);
    view.dispatch({ selection: { anchor: 6 } });
    await vi.waitFor(() => expect(asked).toHaveLength(1));

    view.dispatch({ selection: { anchor: 4, head: 9 } });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(highlighted(view)).toEqual([]);
  });

  test("doesn't ask a server that can't highlight", async () => {
    const { view, asked } = await open({});

    view.dispatch({ selection: { anchor: 6 } });
    await rest();

    expect(asked).toEqual([]);
    expect(highlighted(view)).toEqual([]);
  });

  test('highlights nothing when turned off', async () => {
    const { view, asked } = await open(undefined, 0, highlightUsages.of(false));

    view.dispatch({ selection: { anchor: 6 } });
    await rest();

    expect(highlighted(view)).toEqual([]);
    expect(asked).toEqual([]);
  });

  test('clears the highlights when turned off, and highlights again when turned back on', async () => {
    const setting = new Compartment();
    const { view } = await open(undefined, 0, setting.of(highlightUsages.of(true)));
    view.dispatch({ selection: { anchor: 6 } });
    await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));

    view.dispatch({ effects: setting.reconfigure(highlightUsages.of(false)) });
    expect(highlighted(view)).toEqual([]);

    view.dispatch({ effects: setting.reconfigure(highlightUsages.of(true)) });
    await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));
  });

  describe('with a grammar', () => {
    test('highlights a name', async () => {
      const { view, asked } = await open(undefined, 0, rust);

      view.dispatch({ selection: { anchor: 6 } });

      await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));
      expect(asked).toHaveLength(1);
    });

    test('highlights nothing in a keyword, a comment or a string', async () => {
      const { view, asked } = await open(undefined, 0, rust);

      for (const pos of [1, DOC.indexOf('// total') + 4, DOC.indexOf('"total"') + 2]) {
        view.dispatch({ selection: { anchor: pos } });
        await rest();
      }

      expect(highlighted(view)).toEqual([]);
      expect(asked).toEqual([]);
    });

    test('clears the highlights at once when the caret moves from a name onto a keyword', async () => {
      const { view, asked } = await open(undefined, 0, rust);
      view.dispatch({ selection: { anchor: 6 } });
      await vi.waitFor(() => expect(highlighted(view)).toHaveLength(3));

      view.dispatch({ selection: { anchor: 1 } });

      expect(highlighted(view)).toEqual([]);
      await rest();
      expect(asked).toHaveLength(1);
    });
  });
});
