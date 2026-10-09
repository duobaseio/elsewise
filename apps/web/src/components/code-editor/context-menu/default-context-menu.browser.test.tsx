import { history } from '@codemirror/commands';
import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CodeEditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu/context-menu';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { EditorAdditions, EditorAdditionsContext } from '@/plugins/editor';
import { stubTransport } from '../../../../test/stub-transport';

const DOC = 'fn main() {\n    let a = 1;\n}\n';

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

function mount(additions = new EditorAdditions(), extensions: Extension = []): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView>(null);
    useEffect(() => {
      view.current = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [history(), rightClickContextMenu, rust, extensions],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view.current);
      return () => view.current?.destroy();
    }, []);
    return (
      <EditorAdditionsContext value={additions}>
        <CodeEditorContextMenu view={view}>
          <div ref={host} />
        </CodeEditorContextMenu>
      </EditorAdditionsContext>
    );
  }
  render(<Probe />);
  return ready;
}

// Returns the extension that connects the editor to a server with `capabilities` that answers with `answers`.
async function server(capabilities: object, answers: Parameters<typeof stubTransport>[1] = {}): Promise<Extension> {
  const instance = new LanguageServerInstance(
    { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => stubTransport(capabilities, answers) },
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  return instance.client.plugin('file:///worktree/main.rs', 'rust');
}

// Returns the labels of the menu's items, and `-` for each separator. An item's label is its first node, ahead of its
// shortcut.
function labels(): (string | null | undefined)[] {
  return [...document.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-separator"]')].map(
    (element) =>
      element.getAttribute('data-slot') === 'context-menu-separator' ? '-' : element.firstChild?.textContent,
  );
}

const CAPABILITIES = {
  definitionProvider: true,
  referencesProvider: true,
  renameProvider: true,
};

// The range of `text` in `DOC`.
function range(text: string) {
  const line = DOC.split('\n').findIndex((content) => content.includes(text));
  const character = DOC.split('\n')[line].indexOf(text);
  return { start: { line, character }, end: { line, character: character + text.length } };
}

// The accessible name carries the shortcut too.
const item = (name: string) => page.getByRole('menuitem', { name: new RegExp(`^${name}`) });

async function open(view: EditorView, pos: number): Promise<void> {
  const rect = view.coordsAtPos(pos);
  if (rect === null) {
    throw new Error('offscreen');
  }
  const content = view.contentDOM.getBoundingClientRect();
  await userEvent.click(view.contentDOM, {
    button: 'right',
    position: { x: rect.left - content.left + 1, y: rect.top - content.top + 1 },
  });
  await expect.element(item('Paste')).toBeVisible();
}

describe('DEFAULT_CONTEXT_MENU', () => {
  test('cuts and copies only with a selection', async () => {
    const view = await mount();
    await open(view, 0);
    expect(item('Cut').query()).toBeNull();
    expect(item('Copy').query()).toBeNull();
    await userEvent.keyboard('{Escape}');

    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    view.dispatch({ selection: { anchor: 0, head: 2 } });
    await open(view, 1);
    await userEvent.click(item('Copy'));
    expect(write).toHaveBeenLastCalledWith('fn');
    expect(view.state.doc.toString()).toBe(DOC);

    await open(view, 1);
    await userEvent.click(item('Cut'));
    expect(write).toHaveBeenLastCalledWith('fn');
    await expect.poll(() => view.state.doc.toString()).toBe(DOC.slice(2));
  });

  test('pastes', async () => {
    const view = await mount();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('// ');
    await open(view, 0);
    await userEvent.click(item('Paste'));
    await expect.poll(() => view.state.doc.toString()).toBe(`// ${DOC}`);
    expect(view.hasFocus).toBe(true);
  });

  test("shows the language server's items after the clipboard group", async () => {
    const view = await mount(new EditorAdditions(), await server(CAPABILITIES));

    await open(view, DOC.indexOf('main'));

    expect(labels()).toEqual(['Paste', '-', 'Find usages', 'Go to definition', '-', 'Rename…']);
  });

  test("hides what the language server can't do", async () => {
    const view = await mount(new EditorAdditions(), await server({ ...CAPABILITIES, renameProvider: false }));

    await open(view, DOC.indexOf('main'));

    expect(item('Rename').query()).toBeNull();
    expect(item('Find usages').query()).not.toBeNull();
  });

  describe('Find usages', () => {
    test('finds the usages, and keeps them open', async () => {
      const uri = 'file:///worktree/main.rs';
      const view = await mount(
        new EditorAdditions(),
        await server(CAPABILITIES, {
          'textDocument/references': () => [range('a ='), range('main'), range('fn')].map((r) => ({ uri, range: r })),
        }),
      );

      await open(view, DOC.indexOf('a ='));
      await userEvent.click(item('Find usages'));

      await expect.poll(() => view.dom.querySelector('.cm-lsp-references')).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(view.dom.querySelector('.cm-lsp-references')).not.toBeNull();
    });

    test('hides off a symbol, on a keyword and in a comment', async () => {
      const view = await mount(new EditorAdditions(), await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('fn'), doc.indexOf('    let') + 1, doc.indexOf('note') + 1]) {
        await open(view, pos);
        expect(item('Find usages').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('shows on self, in a string and in a read-only document', async () => {
      const view = await mount(new EditorAdditions(), [await server(CAPABILITIES), EditorState.readOnly.of(true)]);
      view.dispatch({
        changes: { from: DOC.length, insert: 'impl S {\n    fn f(&self) -> &str {\n        "path"\n    }\n}\n' },
      });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('self') + 1, doc.indexOf('path') + 1, doc.indexOf('main') + 1]) {
        await open(view, pos);
        expect(item('Find usages').query()).not.toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });
  });

  describe('Go to definition', () => {
    test('goes to the definition', async () => {
      const uri = 'file:///worktree/main.rs';
      const view = await mount(
        new EditorAdditions(),
        await server(CAPABILITIES, { 'textDocument/definition': () => ({ uri, range: range('main') }) }),
      );

      await open(view, DOC.indexOf('a ='));
      await userEvent.click(item('Go to definition'));

      await expect.poll(() => view.state.selection.main.head).toBe(DOC.indexOf('main'));
    });

    test('hides off a symbol, on a keyword and in a comment', async () => {
      const view = await mount(new EditorAdditions(), await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('fn'), doc.indexOf('    let') + 1, doc.indexOf('note') + 1]) {
        await open(view, pos);
        expect(item('Go to definition').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('shows on self, in a string and in a read-only document', async () => {
      const view = await mount(new EditorAdditions(), [await server(CAPABILITIES), EditorState.readOnly.of(true)]);
      view.dispatch({
        changes: { from: DOC.length, insert: 'impl S {\n    fn f(&self) -> &str {\n        "path"\n    }\n}\n' },
      });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('self') + 1, doc.indexOf('path') + 1, doc.indexOf('main') + 1]) {
        await open(view, pos);
        expect(item('Go to definition').query()).not.toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });
  });

  describe('Rename…', () => {
    test('renames in place, with the field focused', async () => {
      const view = await mount(new EditorAdditions(), await server(CAPABILITIES));

      await open(view, DOC.indexOf('main'));
      await userEvent.click(item('Rename'));

      await expect.poll(() => document.activeElement?.closest('.cm-lsp-rename-field')).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(document.activeElement?.closest('.cm-lsp-rename-field')).not.toBeNull();
    });

    test('hides off a symbol', async () => {
      const view = await mount(new EditorAdditions(), await server(CAPABILITIES));

      for (const pos of [DOC.indexOf('fn'), DOC.indexOf('let'), DOC.indexOf('    let') + 1]) {
        await open(view, pos);
        expect(item('Rename').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('hides in a comment or a string', async () => {
      const view = await mount(new EditorAdditions(), await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\nconst S: &str = "text";\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('note'), doc.indexOf('text')]) {
        await open(view, pos + 1);
        expect(item('Rename').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('hides in a read-only document', async () => {
      const view = await mount(new EditorAdditions(), [await server(CAPABILITIES), EditorState.readOnly.of(true)]);

      await open(view, DOC.indexOf('main'));

      expect(item('Rename').query()).toBeNull();
    });

    test('hides with a selection beyond the symbol, or several', async () => {
      const view = await mount(new EditorAdditions(), [
        await server(CAPABILITIES),
        EditorState.allowMultipleSelections.of(true),
      ]);
      const main = DOC.indexOf('main');

      view.dispatch({ selection: { anchor: main, head: main + 6 } });
      await open(view, main + 1);
      expect(item('Rename').query()).toBeNull();
      await userEvent.keyboard('{Escape}');

      view.dispatch({
        selection: EditorSelection.create([EditorSelection.range(main, main + 4), EditorSelection.cursor(0)]),
      });
      await open(view, main + 1);
      expect(item('Rename').query()).toBeNull();
      await userEvent.keyboard('{Escape}');

      view.dispatch({ selection: { anchor: main, head: main + 4 } });
      await open(view, main + 1);
      expect(item('Rename').query()).not.toBeNull();
    });
  });
});
