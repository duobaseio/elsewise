import { formatKey } from '@elsewise/components/lib/platform';
import type { ApplicationCommand, ContextMenuGroup, EditorCommand } from '@elsewise/plugin';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { type CommandManager, CommandManagerContext } from '@/command/command-manager';
import { CommandContextMenu, type CommandContextMenuProps } from '@/command/context-menu';
import { builtInCommands } from '../../test/commands';
import { group, item, labels, menuitem, submenu } from '../../test/context-menu';

// Shows `menu` with `commands` and the `rest` of the props, over a target that `open` right-clicks.
async function mount(
  menu: readonly ContextMenuGroup[],
  commands: CommandManager,
  rest: Partial<CommandContextMenuProps> = {},
): Promise<void> {
  await render(
    <CommandManagerContext value={commands}>
      <CommandContextMenu menu={menu} {...rest}>
        <div data-testid="target" style={{ width: 200, height: 100 }} />
      </CommandContextMenu>
    </CommandManagerContext>,
  );
}

// Returns an application command with `id` whose label is `id`, with `run` and the `rest` of its fields.
function command(
  id: string,
  run: ApplicationCommand['run'] = () => true,
  rest: Partial<ApplicationCommand> = {},
): ApplicationCommand {
  return { scope: 'application', id, label: id, run, ...rest };
}

// Returns commands that include `added`.
function setUp(added: readonly (ApplicationCommand | EditorCommand)[]): CommandManager {
  const commands = builtInCommands();
  commands.add(added);
  return commands;
}

async function open(): Promise<void> {
  await userEvent.click(page.getByTestId('target'), { button: 'right' });
  await expect.element(page.getByRole('menu').first()).toBeVisible();
}

describe('CommandContextMenu', () => {
  test('sorts groups by order then id, and items by order then label', async () => {
    const commands = setUp(['Top', 'First', 'Second', 'Apple', 'Zebra', 'Last'].map((id) => command(id)));
    await mount(
      [
        group('c', [item('Last')], 30),
        group('b', [item('Second', 20), item('First', 10), item('Zebra', 30), item('Apple', 30)], 30),
        group('top', [item('Top')], 0),
      ],
      commands,
    );

    await open();
    expect(labels()).toEqual(['Top', '-', 'First', 'Second', 'Apple', 'Zebra', '-', 'Last']);
  });

  test('shows groups and items without order last', async () => {
    const commands = setUp(['First', 'Apple', 'Zebra', 'Last'].map((id) => command(id)));
    await mount(
      [group('a', [item('Last')]), group('b', [item('Zebra'), item('Apple'), item('First', 10)], 30)],
      commands,
    );

    await open();
    expect(labels()).toEqual(['First', 'Apple', 'Zebra', '-', 'Last']);
  });

  test('shows command label and first key', async () => {
    const commands = setUp([command('a.rename', () => true, { label: 'Rename…', defaultKeys: ['Shift-F6', 'F2'] })]);
    await mount([group('a', [item('a.rename')])], commands);

    await open();
    await expect.element(menuitem('Rename…')).toHaveTextContent(`Rename…${formatKey('Shift-F6')}`);
  });

  test('calls onClosed before running item', async () => {
    const events: string[] = [];
    const commands = setUp([
      command('Item', () => {
        events.push('run');
        return true;
      }),
    ]);
    await mount([group('a', [item('Item')])], commands, { onClosed: () => events.push('closed') });

    await open();
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(events).toEqual(['closed', 'run']));
  });

  test('hides editor command without view', async () => {
    const commands = setUp([{ scope: 'editor', id: 'Editor', label: 'Editor', run: () => true }, command('Other')]);
    await mount([group('a', [item('Editor'), item('Other')])], commands);

    await open();
    expect(labels()).toEqual(['Other']);
  });

  test('hides item of hidden or unknown command', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let shown = true;
    const commands = setUp([command('Item', () => true, { shown: () => shown }), command('Other')]);
    await mount([group('a', [item('Item'), item('Unknown'), item('Other')])], commands);

    await open();
    expect(labels()).toEqual(['Item', 'Other']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    await userEvent.keyboard('{Escape}');

    shown = false;
    await open();
    expect(labels()).toEqual(['Other']);
  });

  test('disables item of disabled command', async () => {
    const commands = setUp([command('Item', () => true, { enabled: () => false })]);
    await mount([group('a', [item('Item')])], commands);

    await open();
    await expect.element(menuitem('Item')).toHaveAttribute('aria-disabled', 'true');
  });

  test('hides item of command throwing in shown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const commands = setUp([
      command('Broken', () => true, {
        shown: () => {
          throw new Error('nope');
        },
      }),
      command('Other'),
    ]);
    await mount([group('a', [item('Broken'), item('Other')])], commands);

    await open();
    expect(labels()).toEqual(['Other']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('places command and submenu once per group', async () => {
    const commands = setUp([command('Item'), command('Other')]);
    await mount(
      [
        group(
          'a',
          [item('Item'), item('Other'), item('Item', 5), submenu('more', 'More'), submenu('more', 'More', 5)],
          0,
        ),
        group('b', [item('Item')], 10),
        group('inner', [item('Other')], 0, 'more'),
      ],
      commands,
    );

    await open();
    expect(labels()).toEqual(['Item', 'More', 'Other', '-', 'Item']);
    expect(menuitem('More').elements()).toHaveLength(1);
  });

  test('stays closed with nothing to show', async () => {
    const commands = setUp([command('Item', () => true, { shown: () => false })]);
    await mount([group('a', [item('Item')])], commands);

    await userEvent.click(page.getByTestId('target'), { button: 'right' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(page.getByRole('menu').query()).toBeNull();
  });

  test('runs item in nested submenu', async () => {
    const run = vi.fn();
    const commands = setUp([command('Nested item', run)]);
    await mount(
      [
        group('plugin', [submenu('more', 'More')]),
        group('inner', [submenu('deeper', 'Deeper')], 0, 'more'),
        group('innermost', [item('Nested item')], 0, 'deeper'),
      ],
      commands,
    );

    await open();
    await userEvent.click(menuitem('More'));
    await userEvent.click(menuitem('Deeper'));
    await userEvent.click(menuitem('Nested item'));
    expect(run).toHaveBeenCalledWith(commands.application);
  });

  test('shows submenu in several groups, with own labels', async () => {
    const commands = setUp([command('Item')]);
    await mount(
      [
        group('a', [submenu('more', 'More')], 0),
        group('b', [submenu('more', 'Other')], 10),
        group('inner', [item('Item')], 0, 'more'),
      ],
      commands,
    );

    await open();
    expect(labels()).toEqual(['More', '-', 'Other']);
    await userEvent.click(menuitem('Other'));
    await expect.element(menuitem('Item')).toBeVisible();
  });

  test('hides submenu with nothing shown, without groups or inside itself', async () => {
    const commands = setUp([command('Hidden item', () => true, { shown: () => false }), command('Item')]);
    await mount(
      [
        group('plugin', [submenu('empty', 'Empty'), submenu('none', 'None'), submenu('loop', 'Loop'), item('Item')]),
        group('inner', [item('Hidden item')], 0, 'empty'),
        group('x', [item('Item'), submenu('loop', 'Loop')], 0, 'loop'),
      ],
      commands,
    );

    await open();
    expect(labels()).toEqual(['Item', 'Loop']);
    expect(menuitem('Empty').query()).toBeNull();
    expect(menuitem('None').query()).toBeNull();
    await userEvent.click(menuitem('Loop'));
    await expect.element(menuitem('Item').nth(1)).toBeVisible();
    expect(menuitem('Loop').elements()).toHaveLength(1);
  });

  test('ticks active command', async () => {
    const commands = setUp([
      command('On', () => true, { active: () => true }),
      command('Off', () => true, { active: () => false }),
      command('Plain'),
    ]);
    await mount([group('a', [item('On'), item('Off'), item('Plain')])], commands);

    await open();
    await expect.element(menuitem('On')).toHaveAttribute('aria-checked', 'true');
    await expect.element(menuitem('Off')).toHaveAttribute('aria-checked', 'false');
    await expect.element(menuitem('Plain')).not.toHaveAttribute('aria-checked');
    expect(labels()).toEqual(['Off', 'On', 'Plain']);
  });

  test('runs active item and closes', async () => {
    const run = vi.fn(() => true);
    const onClosed = vi.fn();
    const commands = setUp([command('Item', run, { active: () => true })]);
    await mount([group('a', [item('Item')])], commands, { onClosed });

    await open();
    await userEvent.click(menuitem('Item'));

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
