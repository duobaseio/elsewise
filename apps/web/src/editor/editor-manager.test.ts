import { LanguageDescription } from '@codemirror/language';
import { languages as DEFAULT_LANGUAGES } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import {
  DEFAULT_EDITOR_CONTEXT_MENU,
  type EditorContextMenu,
  type EditorContextMenuItem,
  type EditorContextSubmenu,
  type LanguageServer,
} from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_CONTEXT_MENU } from '@/components/code-editor/context-menu/default-context-menu';
import { EditorManager } from './editor-manager';

// Returns a language named `name` whose grammar never loads.
function language(name: string): LanguageDescription {
  return LanguageDescription.of({ name, extensions: ['toy'], load: () => new Promise(() => {}) });
}

// Returns a language server with `id` that never starts.
function server(id: string): LanguageServer {
  return { id, name: id, languages: { Toy: 'toy' }, start: () => new Promise(() => {}) };
}

// Returns a submenu with `id`, `label` and `items`.
function submenu(id: string, label: string, items: EditorContextMenu): EditorContextSubmenu {
  return { type: 'submenu', id, label, items };
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

describe('addContextMenuItems', () => {
  const first: EditorContextMenuItem = { type: 'item', id: 'first', label: 'First', command: () => {} };
  const second: EditorContextMenuItem = { type: 'item', id: 'second', label: 'Second', command: () => {} };
  const third: EditorContextMenuItem = { type: 'item', id: 'third', label: 'Third', command: () => {} };

  test('adds items until disposed', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenuItems({ a: [first], b: [second] });

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first], b: [second] });

    dispose();

    expect(editor.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('adds items to built-in ones', () => {
    const editor = new EditorManager();
    const clipboard = DEFAULT_EDITOR_CONTEXT_MENU.clipboard.id;
    editor.addContextMenuItems({ [clipboard]: [first] });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      [clipboard]: [...(DEFAULT_CONTEXT_MENU[clipboard] ?? []), first],
    });
  });

  test('merges items of same group', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [first], b: [second] });
    editor.addContextMenuItems({ a: [third] });

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, third], b: [second] });
  });

  test('removes only disposed items from group', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenuItems({ a: [first], b: [second] });
    editor.addContextMenuItems({ a: [third] });
    dispose();

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [third] });
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const items = { a: [first] };
    const dispose = editor.addContextMenuItems(items);
    editor.addContextMenuItems(items);
    dispose();

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });
  });

  test('throws and keeps items when entry is neither item nor submenu', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenuItems({ a: [first] });

    expect(() => editor.addContextMenuItems({ a: [{ type: 'separator' } as never] })).toThrow();
    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });

    editor.addContextMenuItems({ a: [second] });
    dispose();

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [second] });
  });

  test('throws and keeps items when submenu contains itself', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [first] });
    const items: Record<string, EditorContextSubmenu[]> = {};
    const loop: EditorContextSubmenu = { type: 'submenu', id: 'loop', label: 'Loop', items };
    items.x = [loop];

    expect(() => editor.addContextMenuItems({ a: [loop] })).toThrow(RangeError);
    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });

    editor.addContextMenuItems({ a: [second] });

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, second] });
  });

  test('merges group named after property of every object', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ constructor: [first] });
    editor.addContextMenuItems({ constructor: [second] });

    expect(Object.entries(editor.contextMenuItems)).toContainEqual(['constructor', [first, second]]);
  });

  test("merges same-id submenus' items in group", () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    editor.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [second], y: [third] })] });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first, second], y: [third] })],
    });
  });

  test('keeps label of submenu added first', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [submenu('menu', 'Original', { x: [first] })] });
    editor.addContextMenuItems({ a: [submenu('menu', 'Other', { x: [second] })] });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Original', { x: [first, second] })],
    });
  });

  test('merges submenus nested in submenus', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [first] })] })],
    });
    editor.addContextMenuItems({
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [second], q: [third] })] })],
    });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [first, second], q: [third] })] })],
    });
  });

  test('keeps same-id items apart', () => {
    const editor = new EditorManager();
    const same: EditorContextMenuItem = { ...second, id: first.id };
    editor.addContextMenuItems({ a: [first] });
    editor.addContextMenuItems({ a: [same] });

    expect(editor.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, same] });
  });

  test('keeps same-id submenu and item apart', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [first] });
    editor.addContextMenuItems({ a: [submenu(first.id, 'Menu', { x: [second] })] });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [first, submenu(first.id, 'Menu', { x: [second] })],
    });
  });

  test('keeps same-id submenus in different groups apart', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    editor.addContextMenuItems({ b: [submenu('menu', 'Menu', { x: [second] })] });

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first] })],
      b: [submenu('menu', 'Menu', { x: [second] })],
    });
  });

  test('removes only disposed items from merged submenu', () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    const dispose = editor.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [second], y: [third] })] });
    dispose();

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first] })],
    });
  });

  test('keeps merged submenu when first-added submenu is disposed', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenuItems({ a: [submenu('menu', 'Original', { x: [first] })] });
    editor.addContextMenuItems({ a: [submenu('menu', 'Other', { x: [second] })] });
    dispose();

    expect(editor.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Other', { x: [second] })],
    });
  });
});
