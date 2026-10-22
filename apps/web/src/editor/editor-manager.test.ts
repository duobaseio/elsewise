import { EditorView } from '@codemirror/view';
import type { ContextMenuGroup, ContextMenuItem, EditorToolbarItem } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_CONTEXT_MENU } from '@/editor/default-context-menu';
import { EditorManager } from './editor-manager';

// Returns an item that runs the command with `id`.
function item(id: string): ContextMenuItem {
  return { type: 'item', command: id };
}

// Returns a group in the submenu with id `menu`, or in the menu itself.
function group(menu?: string): ContextMenuGroup {
  return menu === undefined ? {} : { menu };
}

// Returns a view that stands in for an editor, named `name`.
function view(name: string): EditorView {
  return { name } as unknown as EditorView;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activate', () => {
  test('does not notify when view is already active', () => {
    const editor = new EditorManager();
    const listener = vi.fn();
    const a = view('a');
    editor.subscribe(listener);
    editor.activate(a);
    editor.activate(a);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('deactivate', () => {
  test('clears and notifies when view is active', () => {
    const editor = new EditorManager();
    const listener = vi.fn();
    const a = view('a');
    editor.activate(a);
    editor.subscribe(listener);
    editor.deactivate(a);

    expect(editor.active).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  test('ignores another view', () => {
    const editor = new EditorManager();
    const listener = vi.fn();
    const a = view('a');
    editor.activate(a);
    editor.subscribe(listener);
    editor.deactivate(view('b'));

    expect(editor.active).toBe(a);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('addExtensions', () => {
  test('adds extensions until disposed', () => {
    const editor = new EditorManager();
    const first = [EditorView.editable.of(false), () => []];
    const second = [() => []];
    const dispose = editor.addExtensions(first);
    editor.addExtensions(second);

    expect(editor.extensions).toEqual([...first, ...second]);

    dispose();

    expect(editor.extensions).toEqual(second);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const extensions = [() => []];
    const dispose = editor.addExtensions(extensions);
    editor.addExtensions(extensions);
    dispose();

    expect(editor.extensions).toEqual(extensions);
  });
});

describe('addContextMenus', () => {
  test('adds submenus, groups and items until disposed', () => {
    const editor = new EditorManager();
    const added = {
      submenus: { menu: 'Menu' },
      groups: { a: group(), b: group('menu') },
      items: { a: [item('first')], b: [item('second')] },
    };
    const dispose = editor.addContextMenus([added]);

    expect(editor.contextMenu.submenus.menu).toBe('Menu');
    expect(editor.contextMenu.groups.a).toEqual(group());
    expect(editor.contextMenu.groups.b).toEqual(group('menu'));
    expect(editor.contextMenu.items.a).toEqual([item('first')]);
    expect(editor.contextMenu.items.b).toEqual([item('second')]);

    dispose();

    expect(editor.contextMenu.submenus.menu).toBeUndefined();
    expect(editor.contextMenu.groups.a).toBeUndefined();
    expect(editor.contextMenu.items.a).toBeUndefined();
  });

  test('has built-in submenus, groups and items', () => {
    const editor = new EditorManager();

    expect(editor.contextMenu).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('appends items of group in order of addition', () => {
    const editor = new EditorManager();
    editor.addContextMenus([{ groups: { a: group() }, items: { a: [item('first')] } }]);
    editor.addContextMenus([{ items: { a: [item('second')] } }]);

    expect(editor.contextMenu.items.a).toEqual([item('first'), item('second')]);
  });

  test('removes only disposed items from group', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenus([{ groups: { a: group() }, items: { a: [item('first')] } }]);
    editor.addContextMenus([{ items: { a: [item('second')] } }]);
    dispose();

    expect(editor.contextMenu.items.a).toEqual([item('second')]);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const added = { items: { a: [item('first')] } };
    const dispose = editor.addContextMenus([added]);
    editor.addContextMenus([added]);
    dispose();

    expect(editor.contextMenu.items.a).toEqual([item('first')]);
  });

  test('keeps first submenu with id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenus([{ submenus: { same: 'Original' } }]);
    editor.addContextMenus([{ submenus: { same: 'Other' } }]);

    expect(editor.contextMenu.submenus.same).toBe('Original');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same'));
  });

  test('keeps first group with id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenus([{ groups: { same: { order: 1 } } }]);
    editor.addContextMenus([{ groups: { same: { order: 2 } } }]);

    expect(editor.contextMenu.groups.same).toEqual({ order: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same'));
  });

  test('keeps later submenu when first is disposed', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenus([{ submenus: { menu: 'Original' } }]);
    editor.addContextMenus([{ submenus: { menu: 'Other' } }]);
    dispose();

    expect(editor.contextMenu.submenus.menu).toBe('Other');
  });

  test('keeps items added before their group', () => {
    const editor = new EditorManager();
    editor.addContextMenus([{ items: { a: [item('first')] } }]);
    editor.addContextMenus([{ groups: { a: group() } }]);

    expect(editor.contextMenu.groups.a).toEqual(group());
    expect(editor.contextMenu.items.a).toEqual([item('first')]);
  });

  test('keeps group named after property of every object', () => {
    const editor = new EditorManager();
    editor.addContextMenus([{ groups: { constructor: group() }, items: { constructor: [item('first')] } }]);

    expect(editor.contextMenu.groups.constructor).toEqual(group());
    expect(editor.contextMenu.items.constructor).toEqual([item('first')]);
  });
});

describe('addToolbarItems', () => {
  test('appends items until disposed', () => {
    const editor = new EditorManager();
    const first: EditorToolbarItem[] = [{ type: 'command', command: 'a', icon: () => null }];
    const second: EditorToolbarItem[] = [{ type: 'component', id: 'b', component: () => null }];
    const dispose = editor.addToolbarItems(first);
    editor.addToolbarItems(second);

    expect(editor.toolbarItems).toEqual([...first, ...second]);

    dispose();

    expect(editor.toolbarItems).toEqual(second);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const items: EditorToolbarItem[] = [{ type: 'command', command: 'a', icon: () => null }];
    const dispose = editor.addToolbarItems(items);
    editor.addToolbarItems(items);
    dispose();

    expect(editor.toolbarItems).toEqual(items);
  });
});
