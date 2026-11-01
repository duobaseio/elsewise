import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DefinitionParams } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { navigation } from '@/editor/navigation';
import { commandsExtension } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const URI = 'file:///worktree/main.rs';

// `total` is used on the first line, and defined on line 101 of 201. `other` has no definition.
const DOC = `total + other${'\n'.repeat(100)}let total = 1;${'\n'.repeat(100)}`;

// `total` is defined on the first line and used twice below it.
const DECLARED = 'let total = 1;\ntotal + total';

const KEY = PLATFORM === 'mac' ? { metaKey: true } : { ctrlKey: true };

const TOTAL = { start: { line: 100, character: 4 }, end: { line: 100, character: 9 } };

// Returns a transport to a server that finds `total` defined at `range`, as a location, or as a location link from
// `origin` if given, and nothing else.
function transport(range = TOTAL, origin?: typeof TOTAL): StubTransport {
  return new StubTransport(
    { textDocumentSync: 2, definitionProvider: true, referencesProvider: true },
    {
      'textDocument/definition': ({ position }: DefinitionParams) => {
        const word = view.state.wordAt(view.state.doc.line(position.line + 1).from + position.character);
        if (word === null || view.state.sliceDoc(word.from, word.to) !== 'total') {
          return null;
        }
        return origin
          ? [{ targetUri: URI, targetRange: range, targetSelectionRange: range, originSelectionRange: origin }]
          : { uri: URI, range };
      },
      'textDocument/references': () => [
        { uri: URI, range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } } },
        { uri: URI, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
        { uri: URI, range: { start: { line: 1, character: 8 }, end: { line: 1, character: 13 } } },
      ],
    },
  );
}

let view: EditorView;

afterEach(() => {
  view.destroy();
});

async function open(doc: string, stub = transport()): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => stub } satisfies LanguageServer,
    ROOT,
  );
  await instance.start();
  await instance.client.initializing;
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: 2 },
      extensions: [
        instance.client.plugin(URI, 'rust'),
        commandsExtension(),
        navigation(),
        EditorView.theme({ '&': { height: '200px' } }),
      ],
    }),
    parent: document.body,
  });
  return view;
}

// The center of the character at `pos`.
function at(pos: number): { clientX: number; clientY: number } {
  const box = view.coordsForChar(pos);
  if (box === null) {
    throw new Error(`no character at ${pos}`);
  }
  return { clientX: (box.left + box.right) / 2, clientY: (box.top + box.bottom) / 2 };
}

function move(coords: { clientX: number; clientY: number }): void {
  view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { ...coords, ...KEY, bubbles: true }));
}

function click(coords: { clientX: number; clientY: number }): void {
  view.contentDOM.dispatchEvent(
    new MouseEvent('mousedown', { ...coords, ...KEY, button: 0, bubbles: true, cancelable: true }),
  );
}

function underlined(): string[] {
  return [...view.contentDOM.querySelectorAll('.cm-link-active')].map((element) => element.textContent ?? '');
}

// Checks that the cursor is on the definition, in the middle of the editor.
function expectCentered(): void {
  expect(view.state.selection.main.head).toBe(DOC.indexOf('total = 1'));
  const definition = view.coordsAtPos(view.state.selection.main.head);
  const bounds = view.scrollDOM.getBoundingClientRect();
  expect(definition).not.toBeNull();
  expect(Math.abs((definition?.top ?? 0) - (bounds.top + bounds.height / 2))).toBeLessThan(20);
}

describe('EDITOR_GO_TO_DEFINITION', () => {
  test('centers off-screen definition', async () => {
    await open(DOC);

    // Presses Mod-b.
    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'b', ...KEY }), 'editor')).toBe(true);

    await vi.waitFor(expectCentered);
  });
});

describe('serverDefinition', () => {
  test('underlines symbol under pointer while key held', async () => {
    await open(DOC);
    move(at(1));
    await vi.waitFor(() => expect(underlined()).toEqual(['total']));
  });

  test('underlines nothing without definition', async () => {
    await open(DOC);
    move(at(DOC.indexOf('other') + 1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(underlined()).toEqual([]);
  });

  test('underlines origin of location link', async () => {
    await open(DOC, transport(TOTAL, { start: { line: 0, character: 0 }, end: { line: 0, character: 9 } }));
    move(at(1));
    await vi.waitFor(() => expect(underlined()).toEqual(['total + o']));
  });

  test('centers definition on click while key held', async () => {
    await open(DOC);
    move(at(1));
    await vi.waitFor(() => expect(underlined()).toEqual(['total']));
    click(at(1));
    await vi.waitFor(expectCentered);
  });

  test('finds usages of declaration', async () => {
    await open(DECLARED, transport({ start: { line: 0, character: 4 }, end: { line: 0, character: 9 } }));
    move(at(5));
    await vi.waitFor(() => expect(underlined()).toEqual(['total']));
    click(at(5));
    await vi.waitFor(() => expect(document.querySelectorAll('.cm-lsp-reference')).toHaveLength(3));
  });
});
