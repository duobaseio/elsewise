import { history } from '@codemirror/commands';
import { foldGutter, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type {
  ApplicationCommand,
  ContextMenu,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSubmenuItem,
  EditorCommand,
} from '@elsewise/plugin';
import { useEffect, useRef } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { type CommandManager, CommandManagerContext } from '@/command/command-manager';
import { CodeEditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { builtInCommands, commandsExtension } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

const DOC = 'fn main() {\n    let a = 1;\n}\n';

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

function mount(
  editor = new EditorManager(),
  commands = builtInCommands(editor),
  extensions: Extension = [],
): Promise<EditorView> {
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
          extensions: [history(), foldGutter(), rightClickContextMenu, rust, extensions],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view.current);
      return () => view.current?.destroy();
    }, []);
    return (
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <CodeEditorContextMenu view={view}>
            <div ref={host} />
          </CodeEditorContextMenu>
        </CommandManagerContext>
      </EditorManagerContext>
    );
  }
  render(<Probe />);
  return ready;
}

// Returns an editor command with `id` whose label is `id`, with `run` and the `rest` of its fields.
function command(id: string, run: EditorCommand['run'] = () => {}, rest: Partial<EditorCommand> = {}): EditorCommand {
  return { scope: 'editor', id, label: id, run, ...rest };
}

// Returns an item that runs the command with `id` at `order`.
function item(id: string, order = 0): ContextMenuItem {
  return { type: 'item', order, command: id };
}

// Returns an item that opens the submenu with `id` at `order`.
function submenu(id: string, order = 0): ContextMenuSubmenuItem {
  return { type: 'submenu', order, submenu: id };
}

// Returns a group at `order` in the submenu with id `menu`, or in the menu itself.
function group(order = 0, menu?: string): ContextMenuGroup {
  return menu === undefined ? { order } : { menu, order };
}

// Returns a menu that adds `submenus`, `groups` and `items`.
function menu({ submenus = {}, groups = {}, items = {} }: Partial<ContextMenu>): ContextMenu {
  return { submenus, groups, items };
}

// Returns an editor whose commands are `commands`, and the commands.
function setUp(commands: readonly (ApplicationCommand | EditorCommand)[]): [EditorManager, CommandManager] {
  const editor = new EditorManager();
  const manager = builtInCommands(editor);
  manager.add(commands);
  return [editor, manager];
}

// Returns a view with the built-in menu and commands, and `extensions`, e.g. a language server's.
function mountBuiltIn(extensions: Extension = []): Promise<EditorView> {
  const editor = new EditorManager();
  const commands = builtInCommands(editor);
  return mount(editor, commands, [commandsExtension(commands), extensions]);
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

// The accessible name carries the shortcut too.
const menuitem = (name: string) => page.getByRole('menuitem', { name: new RegExp(`^${name}`) });

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
  await expect.element(page.getByRole('menu').first()).toBeVisible();
}

// Returns the labels of the items in `root`, and `-` for each separator. An item's label is its first node, ahead of
// its shortcut.
function labels(root: ParentNode = document): (string | null | undefined)[] {
  return [...root.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-separator"]')].map(
    (element) =>
      element.getAttribute('data-slot') === 'context-menu-separator' ? '-' : element.firstChild?.textContent,
  );
}

describe('DEFAULT_CONTEXT_MENU', () => {
  test("shows language server's items in navigate and refactor groups", async () => {
    const view = await mountBuiltIn(await server(CAPABILITIES));

    await open(view, DOC.indexOf('main'));

    expect(labels()).toEqual(['Show context actions', '-', 'Find usages', 'Go to definition', '-', 'Rename…']);
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

    await expect.poll(() => view.dom.querySelector('.cm-lsp-action')?.textContent).toBe('Organize imports');
  });

  test('disables context actions in read-only document', async () => {
    const view = await mountBuiltIn([await server(CAPABILITIES), EditorState.readOnly.of(true)]);

    await open(view, DOC.indexOf('main'));

    await expect.element(menuitem('Show context actions')).toHaveAttribute('aria-disabled', 'true');
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

describe('CodeEditorContextMenu', () => {
  test('runs command with view on click', async () => {
    const run = vi.fn();
    const [editor, commands] = setUp([command('Item', run)]);
    editor.addContextMenu(menu({ groups: { a: group() }, items: { a: [item('Item')] } }));
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    expect(run).toHaveBeenCalledWith(commands.application, view, null);
  });
  test('focuses editor before running item', async () => {
    let focused: boolean | undefined;
    const [editor, commands] = setUp([command('Item', (_, view) => (focused = view.hasFocus))]);
    editor.addContextMenu(menu({ groups: { a: group() }, items: { a: [item('Item')] } }));
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(focused).toBe(true));
  });

  test('fills submenu from several additions, and keeps it when first is disposed', async () => {
    const [editor, commands] = setUp([command('A'), command('B'), command('Item')]);
    editor.addContextMenu(menu({ groups: { base: group() }, items: { base: [item('Item')] } }));
    const dispose = editor.addContextMenu(
      menu({
        submenus: { more: 'More' },
        groups: { plugin: group(), inner: group(0, 'more') },
        items: { plugin: [submenu('more')], inner: [item('A')] },
      }),
    );
    editor.addContextMenu(
      menu({
        submenus: { more: 'Other' },
        groups: { plugin: group(), inner: group(0, 'more') },
        items: { inner: [item('B')] },
      }),
    );
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('More'));
    await expect.element(menuitem('A')).toBeVisible();
    await expect.element(menuitem('B')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');

    dispose();
    await open(view, 0);
    expect(labels()).toEqual(['Item']);
    expect(menuitem('More').query()).toBeNull();
    expect(menuitem('Other').query()).toBeNull();
  });
});

describe('rightClickContextMenu', () => {
  test('moves caret to right-click outside selection, and keeps it inside', async () => {
    const [editor, commands] = setUp([command('Item')]);
    editor.addContextMenu(menu({ groups: { a: group() }, items: { a: [item('Item')] } }));
    const view = await mount(editor, commands);
    const second = view.state.doc.line(2);

    await open(view, second.from + 8);
    expect(view.state.selection.main.head).toBe(second.from + 8);
    await userEvent.keyboard('{Escape}');

    view.dispatch({ selection: { anchor: second.from, head: second.to } });
    await open(view, second.from + 8);
    expect(view.state.selection.main.from).toBe(second.from);
    expect(view.state.selection.main.to).toBe(second.to);
  });
});
