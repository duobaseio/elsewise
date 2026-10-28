import type { ContextMenuGroup, ContextMenuItem } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ContextMenuManager } from '@/command/context-menu-manager';

// Returns an item that runs the command with `id`.
function item(id: string): ContextMenuItem {
  return { command: id };
}

// Returns the group `id` with `items` and the `rest` of its fields.
function group(id: string, items: ContextMenuItem[], rest: Partial<ContextMenuGroup> = {}): ContextMenuGroup {
  return { id, ...rest, items };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('adds groups after defaults until disposed, notifying', () => {
    const notify = vi.fn();
    const defaults = [group('defaults', [item('default')])];
    const menus = new ContextMenuManager(defaults, notify);
    const added = [group('a', [item('first')])];
    const dispose = menus.add(added);

    expect(menus.groups).toEqual([...defaults, ...added]);

    dispose();

    expect(menus.groups).toEqual(defaults);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  test('appends same-group items in order added', () => {
    const menus = new ContextMenuManager([], () => {});
    menus.add([group('a', [item('first')])]);
    menus.add([group('a', [item('second')])]);

    expect(menus.groups).toContainEqual(group('a', [item('first'), item('second')]));
  });

  test('removes only disposed items from group', () => {
    const menus = new ContextMenuManager([], () => {});
    const dispose = menus.add([group('a', [item('first')])]);
    menus.add([group('a', [item('second')])]);
    dispose();

    expect(menus.groups).toContainEqual(group('a', [item('second')]));
  });

  test('removes only disposed addition when added twice', () => {
    const menus = new ContextMenuManager([], () => {});
    const added = [group('a', [item('first')])];
    const dispose = menus.add(added);
    menus.add(added);
    dispose();

    expect(menus.groups).toContainEqual(group('a', [item('first')]));
  });

  test('takes first defined order and submenu', () => {
    const menus = new ContextMenuManager([], () => {});
    menus.add([group('a', [item('first')])]);
    menus.add([group('a', [item('second')], { order: 1, in: 'menu' })]);

    expect(menus.groups).toContainEqual(group('a', [item('first'), item('second')], { order: 1, in: 'menu' }));
  });

  test('keeps first order and submenu and warns on differing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const menus = new ContextMenuManager([], () => {});
    menus.add([group('a', [], { order: 1, in: 'menu' })]);
    menus.add([group('a', [], { order: 2, in: 'other' })]);

    expect(menus.groups).toContainEqual(group('a', [], { order: 1, in: 'menu' }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring 2'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring other'));
  });

  test('ignores repeated order and submenu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const menus = new ContextMenuManager([], () => {});
    menus.add([group('a', [], { order: 1, in: 'menu' })]);
    menus.add([group('a', [], { order: 1, in: 'menu' })]);

    expect(warn).not.toHaveBeenCalled();
  });

  test('takes later order once first disposed', () => {
    const menus = new ContextMenuManager([], () => {});
    const dispose = menus.add([group('a', [], { order: 1 })]);
    menus.add([group('a', [], { order: 2 })]);
    dispose();

    expect(menus.groups).toContainEqual(group('a', [], { order: 2 }));
  });
});
