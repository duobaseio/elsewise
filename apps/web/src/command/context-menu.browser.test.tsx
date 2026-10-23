import { formatKey } from '@elsewise/components/lib/platform';
import type { ApplicationCommand, ContextMenu, EditorCommand } from '@elsewise/plugin';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { type CommandManager, CommandManagerContext } from '@/command/command-manager';
import { CommandContextMenu, type CommandContextMenuProps } from '@/command/context-menu';
import { builtInCommands } from '../../test/commands';
import { group, item, labels, menu, menuitem, submenu } from '../../test/context-menu';

// Shows `menu` with `commands` and the `rest` of the props, over a target that `open` right-clicks.
async function mount(
  menu: ContextMenu,
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
      menu({
        groups: { c: group(30), b: group(30), top: group(0) },
        items: {
          c: [item('Last')],
          b: [item('Second', 20), item('First', 10), item('Zebra', 30), item('Apple', 30)],
          top: [item('Top')],
        },
      }),
      commands,
    );

    await open();
    expect(labels()).toEqual(['Top', '-', 'First', 'Second', 'Apple', 'Zebra', '-', 'Last']);
  });

  test('shows groups and items without order last', async () => {
    const commands = setUp(['First', 'Apple', 'Zebra', 'Last'].map((id) => command(id)));
    await mount(
      menu({
        groups: { a: group(), b: group(30) },
        items: { a: [item('Last')], b: [item('Zebra'), item('Apple'), item('First', 10)] },
      }),
      commands,
    );

    await open();
    expect(labels()).toEqual(['First', 'Apple', 'Zebra', '-', 'Last']);
  });

  test("shows command's label and first key", async () => {
    const commands = setUp([command('a.rename', () => true, { label: 'Rename…', defaultKeys: ['Shift-F6', 'F2'] })]);
    await mount(menu({ groups: { a: group() }, items: { a: [item('a.rename')] } }), commands);

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
    await mount(menu({ groups: { a: group() }, items: { a: [item('Item')] } }), commands, {
      onClosed: () => events.push('closed'),
    });

    await open();
    await userEvent.click(menuitem('Item'));
    await vi.waitFor(() => expect(events).toEqual(['closed', 'run']));
  });

  test('hides editor command without view', async () => {
    const commands = setUp([{ scope: 'editor', id: 'Editor', label: 'Editor', run: () => true }, command('Other')]);
    await mount(menu({ groups: { a: group() }, items: { a: [item('Editor'), item('Other')] } }), commands);

    await open();
    expect(labels()).toEqual(['Other']);
  });

  test('hides item of hidden or unknown command', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let shown = true;
    const commands = setUp([command('Item', () => true, { shown: () => shown }), command('Other')]);
    await mount(
      menu({ groups: { a: group() }, items: { a: [item('Item'), item('Unknown'), item('Other')] } }),
      commands,
    );

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
    await mount(menu({ groups: { a: group() }, items: { a: [item('Item')] } }), commands);

    await open();
    await expect.element(menuitem('Item')).toHaveAttribute('aria-disabled', 'true');
  });

  test('hides item whose command throws on shown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const commands = setUp([
      command('Broken', () => true, {
        shown: () => {
          throw new Error('nope');
        },
      }),
      command('Other'),
    ]);
    await mount(menu({ groups: { a: group() }, items: { a: [item('Broken'), item('Other')] } }), commands);

    await open();
    expect(labels()).toEqual(['Other']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('places command and submenu once per group', async () => {
    const commands = setUp([command('Item'), command('Other')]);
    await mount(
      menu({
        submenus: { more: 'More' },
        groups: { a: group(0), b: group(10), inner: group(0, 'more') },
        items: {
          a: [item('Item'), item('Other'), item('Item', 5), submenu('more'), submenu('more', 5)],
          b: [item('Item')],
          inner: [item('Other')],
        },
      }),
      commands,
    );

    await open();
    expect(labels()).toEqual(['Item', 'More', 'Other', '-', 'Item']);
    expect(menuitem('More').elements()).toHaveLength(1);
  });

  test('stays closed with nothing to show', async () => {
    const commands = setUp([command('Item', () => true, { shown: () => false })]);
    await mount(menu({ groups: { a: group() }, items: { a: [item('Item')] } }), commands);

    await userEvent.click(page.getByTestId('target'), { button: 'right' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(page.getByRole('menu').query()).toBeNull();
  });

  test('hides item of undeclared group', async () => {
    const commands = setUp([command('Item'), command('Other')]);
    await mount(menu({ groups: { a: group() }, items: { a: [item('Item')], undeclared: [item('Other')] } }), commands);

    await open();
    expect(labels()).toEqual(['Item']);
  });

  test("runs nested submenu's item", async () => {
    const run = vi.fn();
    const commands = setUp([command('Nested item', run)]);
    await mount(
      menu({
        submenus: { more: 'More', deeper: 'Deeper' },
        groups: { plugin: group(), inner: group(0, 'more'), innermost: group(0, 'deeper') },
        items: { plugin: [submenu('more')], inner: [submenu('deeper')], innermost: [item('Nested item')] },
      }),
      commands,
    );

    await open();
    await userEvent.click(menuitem('More'));
    await userEvent.click(menuitem('Deeper'));
    await userEvent.click(menuitem('Nested item'));
    expect(run).toHaveBeenCalledWith(commands.application);
  });

  test('hides submenu with nothing shown, undeclared or inside itself', async () => {
    const commands = setUp([command('Hidden item', () => true, { shown: () => false }), command('Item')]);
    await mount(
      menu({
        submenus: { empty: 'Empty', loop: 'Loop' },
        groups: { plugin: group(), inner: group(0, 'empty'), x: group(0, 'loop') },
        items: {
          plugin: [submenu('empty'), submenu('undeclared'), submenu('loop'), item('Item')],
          inner: [item('Hidden item')],
          x: [item('Item'), submenu('loop')],
        },
      }),
      commands,
    );

    await open();
    expect(labels()).toEqual(['Item', 'Loop']);
    expect(menuitem('Empty').query()).toBeNull();
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
    await mount(menu({ groups: { a: group() }, items: { a: [item('On'), item('Off'), item('Plain')] } }), commands);

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
    await mount(menu({ groups: { a: group() }, items: { a: [item('Item')] } }), commands, { onClosed });

    await open();
    await userEvent.click(menuitem('Item'));

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
