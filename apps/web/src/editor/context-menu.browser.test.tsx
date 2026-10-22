import type { ApplicationCommand, EditorCommand } from '@elsewise/plugin';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { CommandManager } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { builtInCommands } from '../../test/commands';
import { group, item, labels, menu, menuitem, mount, open, submenu } from '../../test/context-menu';

// Returns an editor command with `id` whose label is `id`, with `run` and the `rest` of its fields.
function command(id: string, run: EditorCommand['run'] = () => true, rest: Partial<EditorCommand> = {}): EditorCommand {
  return { scope: 'editor', id, label: id, run, ...rest };
}

// Returns an editor whose commands are `commands`, and the commands.
function setUp(commands: readonly (ApplicationCommand | EditorCommand)[]): [EditorManager, CommandManager] {
  const editor = new EditorManager();
  const manager = builtInCommands(editor);
  manager.add(commands);
  return [editor, manager];
}

describe('EditorContextMenu', () => {
  test('runs command with view on click', async () => {
    const run = vi.fn();
    const [editor, commands] = setUp([command('Item', run)]);
    editor.addContextMenus([menu({ groups: { a: group() }, items: { a: [item('Item')] } })]);
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    expect(run).toHaveBeenCalledWith(commands.application, view, null);
  });
  test('focuses editor before running item', async () => {
    let focused: boolean | undefined;
    const [editor, commands] = setUp([command('Item', (_, view) => (focused = view.hasFocus))]);
    editor.addContextMenus([menu({ groups: { a: group() }, items: { a: [item('Item')] } })]);
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(focused).toBe(true));
  });

  test('fills submenu from several additions, and keeps it when first is disposed', async () => {
    const [editor, commands] = setUp([command('A'), command('B'), command('Item')]);
    editor.addContextMenus([menu({ groups: { base: group(0) }, items: { base: [item('Item')] } })]);
    const dispose = editor.addContextMenus([
      menu({
        submenus: { more: 'More' },
        groups: { plugin: group(), inner: group(0, 'more') },
        items: { plugin: [submenu('more')], inner: [item('A')] },
      }),
    ]);
    editor.addContextMenus([
      menu({
        submenus: { more: 'Other' },
        groups: { plugin: group(), inner: group(0, 'more') },
        items: { inner: [item('B')] },
      }),
    ]);
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('More'));
    await expect.element(menuitem('A')).toBeVisible();
    await expect.element(menuitem('B')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');

    dispose();
    await open(view, 0);
    expect(labels()).toEqual(['Item', '-', 'Show context actions', '-', 'Paste', '-', 'Compare with…']);
    expect(menuitem('More').query()).toBeNull();
    expect(menuitem('Other').query()).toBeNull();
  });
});

describe('RIGHT_CLICK_CONTEXT_MENU', () => {
  test('moves caret to right-click outside selection, and keeps it inside', async () => {
    const [editor, commands] = setUp([command('Item')]);
    editor.addContextMenus([menu({ groups: { a: group() }, items: { a: [item('Item')] } })]);
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
