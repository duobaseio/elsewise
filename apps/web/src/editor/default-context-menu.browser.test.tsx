import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { actions } from '@/editor/actions';
import { COPY, CUT, PASTE } from '@/editor/default-context-menu';
import { EditorManager } from '@/editor/editor-manager';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { builtInCommands, commandsExtension } from '../../test/commands';
import { DOC, labels, menuitem, mount, open } from '../../test/context-menu';
import { StubTransport } from '../../test/stub-transport';

// Returns a view with the built-in menu and commands, and `extensions`, e.g. a language server's.
function mountBuiltIn(extensions: Extension = []): Promise<EditorView> {
  const editor = new EditorManager();
  const commands = builtInCommands(editor);
  return mount(editor, commands, [commandsExtension(commands), actions(), extensions]);
}

// Returns the extension that connects the editor to a server with `capabilities` that answers with `answers`.
async function server(
  capabilities: object,
  answers: ConstructorParameters<typeof StubTransport>[1] = {},
): Promise<Extension> {
  const instance = new LanguageServerInstance(
    { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => new StubTransport(capabilities, answers) },
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  return instance.client.plugin('file:///worktree/main.rs', 'rust');
}

// Offers code actions too, so the menu has an item to open with wherever the others are hidden.
const CAPABILITIES = {
  codeActionProvider: true,
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

// Returns the actions asked of the bridge, which records them instead of running them.
function bridge(): string[] {
  const actions: string[] = [];
  window.bridge = {
    window: {
      cut: () => actions.push('cut'),
      copy: () => actions.push('copy'),
      paste: () => actions.push('paste'),
      setBrightness: () => {},
      setBackground: () => {},
    },
  };
  return actions;
}

afterEach(() => {
  window.bridge = undefined;
});

describe('DEFAULT_CONTEXT_MENU', () => {
  test("shows language server's items in navigate and refactor groups", async () => {
    const view = await mountBuiltIn(await server(CAPABILITIES));

    await open(view, DOC.indexOf('main'));

    expect(labels()).toEqual([
      'Show context actions',
      '-',
      'Paste',
      '-',
      'Find usages',
      'Go to definition',
      '-',
      'Compare with…',
      '-',
      'Rename…',
    ]);
  });

  test('leads with context actions, which open popup', async () => {
    const view = await mountBuiltIn(
      await server(CAPABILITIES, {
        'textDocument/codeAction': () => [{ title: 'Organize imports', kind: 'source.organizeImports' }],
      }),
    );

    await open(view, DOC.indexOf('main'));
    expect(labels()[0]).toBe('Show context actions');
    await userEvent.click(menuitem('Show context actions'));

    await expect.poll(() => view.dom.querySelector('.cm-action')?.textContent).toBe('Organize imports');
  });

  test('disables context actions in read-only document', async () => {
    const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.readOnly.of(true)]);

    await open(view, DOC.indexOf('main'));

    await expect.element(menuitem('Show context actions')).toHaveAttribute('aria-disabled', 'true');
  });

  test('hides cut and copy without selection', async () => {
    const view = await mountBuiltIn();
    const main = DOC.indexOf('main');

    await open(view, main);
    expect(menuitem('Cut').query()).toBeNull();
    expect(menuitem('Copy').query()).toBeNull();
    await userEvent.keyboard('{Escape}');

    view.dispatch({ selection: { anchor: main, head: main + 4 } });
    await open(view, main + 1);
    expect(menuitem('Cut').query()).not.toBeNull();
    expect(menuitem('Copy').query()).not.toBeNull();
  });

  test('disables cut and paste in read-only document', async () => {
    const view = await mountBuiltIn(EditorState.readOnly.of(true));
    const main = DOC.indexOf('main');

    view.dispatch({ selection: { anchor: main, head: main + 4 } });
    await open(view, main + 1);

    await expect.element(menuitem('Cut')).toHaveAttribute('aria-disabled', 'true');
    await expect.element(menuitem('Copy')).not.toHaveAttribute('aria-disabled');
    await expect.element(menuitem('Paste')).toHaveAttribute('aria-disabled', 'true');
  });

  test("hides what language server can't do", async () => {
    const view = await mountBuiltIn(await server({ ...CAPABILITIES, renameProvider: false }));

    await open(view, DOC.indexOf('main'));

    expect(menuitem('Rename').query()).toBeNull();
    expect(menuitem('Find usages').query()).not.toBeNull();
  });

  describe('Find usages', () => {
    test('finds usages, and keeps them open', async () => {
      const uri = 'file:///worktree/main.rs';
      const view = await mountBuiltIn(
        await server(CAPABILITIES, {
          'textDocument/references': () => [range('a ='), range('main'), range('fn')].map((r) => ({ uri, range: r })),
        }),
      );

      await open(view, DOC.indexOf('a ='));
      await userEvent.click(menuitem('Find usages'));

      await expect.poll(() => view.dom.querySelector('.cm-lsp-references')).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(view.dom.querySelector('.cm-lsp-references')).not.toBeNull();
    });

    test('hides off symbol, on keyword and in comment', async () => {
      const view = await mountBuiltIn(await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('fn'), doc.indexOf('    let') + 1, doc.indexOf('note') + 1]) {
        await open(view, pos);
        expect(menuitem('Find usages').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('shows on self, in string and in read-only document', async () => {
      const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.readOnly.of(true)]);
      view.dispatch({
        changes: { from: DOC.length, insert: 'impl S {\n    fn f(&self) -> &str {\n        "path"\n    }\n}\n' },
      });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('self') + 1, doc.indexOf('path') + 1, doc.indexOf('main') + 1]) {
        await open(view, pos);
        expect(menuitem('Find usages').query()).not.toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });
  });

  describe('Go to definition', () => {
    test('goes to definition', async () => {
      const uri = 'file:///worktree/main.rs';
      const view = await mountBuiltIn(
        await server(CAPABILITIES, { 'textDocument/definition': () => ({ uri, range: range('main') }) }),
      );

      await open(view, DOC.indexOf('a ='));
      await userEvent.click(menuitem('Go to definition'));

      await expect.poll(() => view.state.selection.main.head).toBe(DOC.indexOf('main'));
    });

    test('hides off symbol, on keyword and in comment', async () => {
      const view = await mountBuiltIn(await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('fn'), doc.indexOf('    let') + 1, doc.indexOf('note') + 1]) {
        await open(view, pos);
        expect(menuitem('Go to definition').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('shows on self, in string and in read-only document', async () => {
      const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.readOnly.of(true)]);
      view.dispatch({
        changes: { from: DOC.length, insert: 'impl S {\n    fn f(&self) -> &str {\n        "path"\n    }\n}\n' },
      });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('self') + 1, doc.indexOf('path') + 1, doc.indexOf('main') + 1]) {
        await open(view, pos);
        expect(menuitem('Go to definition').query()).not.toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });
  });

  describe('Rename…', () => {
    test('renames in place, with field focused', async () => {
      const view = await mountBuiltIn(await server(CAPABILITIES));

      await open(view, DOC.indexOf('main'));
      await userEvent.click(menuitem('Rename'));

      await expect.poll(() => document.activeElement?.closest('.cm-lsp-rename-field')).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(document.activeElement?.closest('.cm-lsp-rename-field')).not.toBeNull();
    });

    test('hides off symbol', async () => {
      const view = await mountBuiltIn(await server(CAPABILITIES));

      for (const pos of [DOC.indexOf('fn'), DOC.indexOf('let'), DOC.indexOf('    let') + 1]) {
        await open(view, pos);
        expect(menuitem('Rename').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('hides in comment or string', async () => {
      const view = await mountBuiltIn(await server(CAPABILITIES));
      view.dispatch({ changes: { from: DOC.length, insert: '// note\nconst S: &str = "text";\n' } });
      const doc = view.state.doc.toString();

      for (const pos of [doc.indexOf('note'), doc.indexOf('text')]) {
        await open(view, pos + 1);
        expect(menuitem('Rename').query()).toBeNull();
        await userEvent.keyboard('{Escape}');
      }
    });

    test('disables in read-only document', async () => {
      const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.readOnly.of(true)]);

      await open(view, DOC.indexOf('main'));

      await expect.element(menuitem('Rename')).toHaveAttribute('aria-disabled', 'true');
    });

    test('hides with selection beyond symbol, or several', async () => {
      const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.allowMultipleSelections.of(true)]);
      const main = DOC.indexOf('main');

      view.dispatch({ selection: { anchor: main, head: main + 6 } });
      await open(view, main + 1);
      expect(menuitem('Rename').query()).toBeNull();
      await userEvent.keyboard('{Escape}');

      view.dispatch({
        selection: EditorSelection.create([EditorSelection.range(main, main + 4), EditorSelection.cursor(0)]),
      });
      await open(view, main + 1);
      expect(menuitem('Rename').query()).toBeNull();
      await userEvent.keyboard('{Escape}');

      view.dispatch({ selection: { anchor: main, head: main + 4 } });
      await open(view, main + 1);
      expect(menuitem('Rename').query()).not.toBeNull();
    });
  });
});

describe('CUT', () => {
  test('asks bridge to cut', async () => {
    const actions = bridge();
    const view = await mountBuiltIn();
    view.dispatch({ selection: { anchor: 0, head: 2 } });

    builtInCommands().run(CUT.id, view);

    expect(actions).toEqual(['cut']);
  });

  test('disables in read-only document', async () => {
    const actions = bridge();
    const view = await mountBuiltIn(EditorState.readOnly.of(true));
    view.dispatch({ selection: { anchor: 0, head: 2 } });

    expect(builtInCommands().run(CUT.id, view)).toBe(false);
    expect(actions).toEqual([]);
  });
});

describe('COPY', () => {
  test('asks bridge to copy, without selection too', async () => {
    const actions = bridge();
    const view = await mountBuiltIn();
    view.dispatch({ selection: { anchor: 0, head: 2 } });

    builtInCommands().run(COPY.id, view);
    view.dispatch({ selection: { anchor: 0 } });
    builtInCommands().run(COPY.id, view);

    expect(actions).toEqual(['copy', 'copy']);
  });
});

describe('PASTE', () => {
  test('asks bridge to paste', async () => {
    const actions = bridge();

    builtInCommands().run(PASTE.id, await mountBuiltIn());

    expect(actions).toEqual(['paste']);
  });

  test('disables in read-only document', async () => {
    const actions = bridge();

    expect(builtInCommands().run(PASTE.id, await mountBuiltIn(EditorState.readOnly.of(true)))).toBe(false);
    expect(actions).toEqual([]);
  });
});
