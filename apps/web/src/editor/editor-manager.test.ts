import { LanguageDescription } from '@codemirror/language';
import { languages as DEFAULT_LANGUAGES } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import type { ContextMenu, ContextMenuGroup, ContextMenuItem, LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_CONTEXT_MENU } from '@/components/code-editor/context-menu';
import { EditorManager } from './editor-manager';

// Returns a language named `name` whose grammar never loads.
function language(name: string): LanguageDescription {
  return LanguageDescription.of({ name, extensions: ['toy'], load: () => new Promise(() => {}) });
}

// Returns a language server with `id` that never starts.
function server(id: string): LanguageServer {
  return { id, name: id, languages: { Toy: 'toy' }, start: () => new Promise(() => {}) };
}

// Returns an item that runs the command with `id`.
function item(id: string): ContextMenuItem {
  return { type: 'item', order: 0, command: id };
}

// Returns a group in the submenu with id `menu`, or in the menu itself.
function group(menu?: string): ContextMenuGroup {
  return menu === undefined ? { order: 0 } : { menu, order: 0 };
}

// Returns a menu that adds `submenus`, `groups` and `items`.
function menu({ submenus = {}, groups = {}, items = {} }: Partial<ContextMenu>): ContextMenu {
  return { submenus, groups, items };
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

describe('addLanguages', () => {
  test('prepends languages until disposed', () => {
    const editor = new EditorManager();
    const first = [language('a'), language('b')];
    const second = [language('c')];
    const dispose = editor.addLanguages(first);
    editor.addLanguages(second);

    expect(editor.languages).toEqual([...second, ...first, ...DEFAULT_LANGUAGES]);

    dispose();

    expect(editor.languages).toEqual([...second, ...DEFAULT_LANGUAGES]);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const languages = [language('a')];
    const dispose = editor.addLanguages(languages);
    editor.addLanguages(languages);
    dispose();

    expect(editor.languages).toEqual([...languages, ...DEFAULT_LANGUAGES]);
  });
});

describe('addLanguageServers', () => {
  test('prepends servers until disposed', () => {
    const editor = new EditorManager();
    const first = [server('a'), server('b')];
    const second = [server('c')];
    const dispose = editor.addLanguageServers(first);
    editor.addLanguageServers(second);

    expect(editor.languageServers).toEqual([...second, ...first]);

    dispose();

    expect(editor.languageServers).toEqual(second);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const servers = [server('a')];
    const dispose = editor.addLanguageServers(servers);
    editor.addLanguageServers(servers);
    dispose();

    expect(editor.languageServers).toEqual(servers);
  });
});

describe('addContextMenu', () => {
  test('adds submenus, groups and items until disposed', () => {
    const editor = new EditorManager();
    const added = menu({
      submenus: { menu: 'Menu' },
      groups: { a: group(), b: group('menu') },
      items: { a: [item('first')], b: [item('second')] },
    });
    const dispose = editor.addContextMenu(added);

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
    editor.addContextMenu(menu({ groups: { a: group() }, items: { a: [item('first')] } }));
    editor.addContextMenu(menu({ items: { a: [item('second')] } }));

    expect(editor.contextMenu.items.a).toEqual([item('first'), item('second')]);
  });

  test('removes only disposed items from group', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenu(menu({ groups: { a: group() }, items: { a: [item('first')] } }));
    editor.addContextMenu(menu({ items: { a: [item('second')] } }));
    dispose();

    expect(editor.contextMenu.items.a).toEqual([item('second')]);
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const added = menu({ items: { a: [item('first')] } });
    const dispose = editor.addContextMenu(added);
    editor.addContextMenu(added);
    dispose();

    expect(editor.contextMenu.items.a).toEqual([item('first')]);
  });

  test('keeps first submenu with id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenu(menu({ submenus: { same: 'Original' } }));
    editor.addContextMenu(menu({ submenus: { same: 'Other' } }));

    expect(editor.contextMenu.submenus.same).toBe('Original');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same'));
  });

  test('keeps first group with id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenu(menu({ groups: { same: { order: 1 } } }));
    editor.addContextMenu(menu({ groups: { same: { order: 2 } } }));

    expect(editor.contextMenu.groups.same).toEqual({ order: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same'));
  });

  test('keeps later submenu when first is disposed', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenu(menu({ submenus: { menu: 'Original' } }));
    editor.addContextMenu(menu({ submenus: { menu: 'Other' } }));
    dispose();

    expect(editor.contextMenu.submenus.menu).toBe('Other');
  });

  test('keeps items added before their group', () => {
    const editor = new EditorManager();
    editor.addContextMenu(menu({ items: { a: [item('first')] } }));
    editor.addContextMenu(menu({ groups: { a: group() } }));

    expect(editor.contextMenu.groups.a).toEqual(group());
    expect(editor.contextMenu.items.a).toEqual([item('first')]);
  });

  test('keeps group named after property of every object', () => {
    const editor = new EditorManager();
    editor.addContextMenu(menu({ groups: { constructor: group() }, items: { constructor: [item('first')] } }));

    expect(editor.contextMenu.groups.constructor).toEqual(group());
    expect(editor.contextMenu.items.constructor).toEqual([item('first')]);
  });
});
