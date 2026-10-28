import type { EditorCommand } from '@elsewise/plugin';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { CommandManager } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { builtInCommands } from '../../../test/commands';
import { group, item, labels, menuitem, mount, open, submenu } from '../../../test/context-menu';

// Returns an editor command with `id` whose label is `id`, with `run` and the `rest` of its fields.
function command(id: string, run: EditorCommand['run'] = () => true): EditorCommand {
  return { scope: 'editor', id, label: id, run };
}

// Returns an editor whose commands are `commands`, and the commands.
function setUp(commands: readonly EditorCommand[]): [EditorManager, CommandManager] {
  const editor = new EditorManager();
  const manager = builtInCommands(editor);
  manager.add(commands);
  return [editor, manager];
}

describe('EditorContextMenu', () => {
  test('runs command with view on click', async () => {
    const run = vi.fn();
    const [editor, commands] = setUp([command('Item', run)]);
    editor.addContextMenu([group('a', [item('Item')])]);
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(commands.application, view));
  });

  test('focuses editor before running item', async () => {
    let focused: boolean | undefined;
    const [editor, commands] = setUp([command('Item', (_, view) => (focused = view.hasFocus))]);
    editor.addContextMenu([group('a', [item('Item')])]);
    const view = await mount(editor, commands);

    await open(view, 0);
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(focused).toBe(true));
  });

  test('fills submenu from several additions, until item disposed', async () => {
    const [editor, commands] = setUp([command('A'), command('B'), command('Item')]);
    editor.addContextMenu([group('base', [item('Item')], 0)]);
    const dispose = editor.addContextMenu([
      group('plugin', [submenu('more', 'More')]),
      group('inner', [item('A')], 0, 'more'),
    ]);
    editor.addContextMenu([group('plugin', []), group('inner', [item('B')], 0, 'more')]);
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
  });
});

describe('RIGHT_CLICK_CONTEXT_MENU', () => {
  test('moves caret to right-click outside selection, and keeps it inside', async () => {
    const [editor, commands] = setUp([command('Item')]);
    editor.addContextMenu([group('a', [item('Item')])]);
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
