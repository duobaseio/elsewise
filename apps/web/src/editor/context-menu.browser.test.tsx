import { history } from '@codemirror/commands';
import { foldGutter, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
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
import { EditorContextMenu, rightClickContextMenu } from '@/editor/context-menu';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { builtInCommands } from '../../test/commands';

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
          <EditorContextMenu view={view}>
            <div ref={host} />
          </EditorContextMenu>
        </CommandManagerContext>
      </EditorManagerContext>
    );
  }
  render(<Probe />);
  return ready;
}

// Returns an editor command with `id` whose label is `id`, with `run` and the `rest` of its fields.
function command(id: string, run: EditorCommand['run'] = () => true, rest: Partial<EditorCommand> = {}): EditorCommand {
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

describe('EditorContextMenu', () => {
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
    expect(labels()).toEqual(['Item', '-', 'Paste']);
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
