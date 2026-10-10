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
import { EditorAdditions } from './editor';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('addExtensions', () => {
  test('adds the extensions until disposed', () => {
    const additions = new EditorAdditions();
    const first = [EditorView.editable.of(false), () => []];
    const second = [() => []];
    const dispose = additions.addExtensions(first);
    additions.addExtensions(second);

    expect(additions.extensions).toEqual([...first, ...second]);

    dispose();

    expect(additions.extensions).toEqual(second);
  });

  test('removes only the disposed extensions when the same ones are added twice', () => {
    const additions = new EditorAdditions();
    const extensions = [() => []];
    const dispose = additions.addExtensions(extensions);
    additions.addExtensions(extensions);
    dispose();

    expect(additions.extensions).toEqual(extensions);
  });
});

describe('addLanguages', () => {
  test('adds the languages before the earlier ones until disposed', () => {
    const additions = new EditorAdditions();
    const first = [language('a'), language('b')];
    const second = [language('c')];
    const dispose = additions.addLanguages(first);
    additions.addLanguages(second);

    expect(additions.languages).toEqual([...second, ...first, ...DEFAULT_LANGUAGES]);

    dispose();

    expect(additions.languages).toEqual([...second, ...DEFAULT_LANGUAGES]);
  });

  test('removes only the disposed languages when the same ones are added twice', () => {
    const additions = new EditorAdditions();
    const languages = [language('a')];
    const dispose = additions.addLanguages(languages);
    additions.addLanguages(languages);
    dispose();

    expect(additions.languages).toEqual([...languages, ...DEFAULT_LANGUAGES]);
  });
});

describe('addLanguageServers', () => {
  test('adds the servers before the earlier ones until disposed', () => {
    const additions = new EditorAdditions();
    const first = [server('a'), server('b')];
    const second = [server('c')];
    const dispose = additions.addLanguageServers(first);
    additions.addLanguageServers(second);

    expect(additions.languageServers).toEqual([...second, ...first]);

    dispose();

    expect(additions.languageServers).toEqual(second);
  });

  test('removes only the disposed servers when the same ones are added twice', () => {
    const additions = new EditorAdditions();
    const servers = [server('a')];
    const dispose = additions.addLanguageServers(servers);
    additions.addLanguageServers(servers);
    dispose();

    expect(additions.languageServers).toEqual(servers);
  });
});

describe('addContextMenuItems', () => {
  const first: EditorContextMenuItem = { type: 'item', id: 'first', label: 'First', command: () => {} };
  const second: EditorContextMenuItem = { type: 'item', id: 'second', label: 'Second', command: () => {} };
  const third: EditorContextMenuItem = { type: 'item', id: 'third', label: 'Third', command: () => {} };

  test('adds the items until disposed', () => {
    const additions = new EditorAdditions();
    const dispose = additions.addContextMenuItems({ a: [first], b: [second] });

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first], b: [second] });

    dispose();

    expect(additions.contextMenuItems).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('adds the items to the built-in ones', () => {
    const additions = new EditorAdditions();
    const clipboard = DEFAULT_EDITOR_CONTEXT_MENU.clipboard.id;
    additions.addContextMenuItems({ [clipboard]: [first] });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      [clipboard]: [...(DEFAULT_CONTEXT_MENU[clipboard] ?? []), first],
    });
  });

  test('merges the items of the same group', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [first], b: [second] });
    additions.addContextMenuItems({ a: [third] });

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, third], b: [second] });
  });

  test('removes only the disposed items from a group', () => {
    const additions = new EditorAdditions();
    const dispose = additions.addContextMenuItems({ a: [first], b: [second] });
    additions.addContextMenuItems({ a: [third] });
    dispose();

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [third] });
  });

  test('removes only the disposed items when the same ones are added twice', () => {
    const additions = new EditorAdditions();
    const items = { a: [first] };
    const dispose = additions.addContextMenuItems(items);
    additions.addContextMenuItems(items);
    dispose();

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });
  });

  test('throws and keeps the items when an entry is neither an item nor a submenu', () => {
    const additions = new EditorAdditions();
    const dispose = additions.addContextMenuItems({ a: [first] });

    expect(() => additions.addContextMenuItems({ a: [{ type: 'separator' } as never] })).toThrow();
    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });

    additions.addContextMenuItems({ a: [second] });
    dispose();

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [second] });
  });

  test('throws and keeps the items when a submenu contains itself', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [first] });
    const items: Record<string, EditorContextSubmenu[]> = {};
    const loop: EditorContextSubmenu = { type: 'submenu', id: 'loop', label: 'Loop', items };
    items.x = [loop];

    expect(() => additions.addContextMenuItems({ a: [loop] })).toThrow(RangeError);
    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first] });

    additions.addContextMenuItems({ a: [second] });

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, second] });
  });

  test('merges a group named after a property of every object', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ constructor: [first] });
    additions.addContextMenuItems({ constructor: [second] });

    expect(Object.entries(additions.contextMenuItems)).toContainEqual(['constructor', [first, second]]);
  });

  test('merges the items of submenus with the same id in a group', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    additions.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [second], y: [third] })] });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first, second], y: [third] })],
    });
  });

  test('keeps the label of the submenu added first', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [submenu('menu', 'Original', { x: [first] })] });
    additions.addContextMenuItems({ a: [submenu('menu', 'Other', { x: [second] })] });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Original', { x: [first, second] })],
    });
  });

  test('merges submenus nested in submenus', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [first] })] })],
    });
    additions.addContextMenuItems({
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [second], q: [third] })] })],
    });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('outer', 'Outer', { x: [submenu('inner', 'Inner', { p: [first, second], q: [third] })] })],
    });
  });

  test('keeps items with the same id apart', () => {
    const additions = new EditorAdditions();
    const same: EditorContextMenuItem = { ...second, id: first.id };
    additions.addContextMenuItems({ a: [first] });
    additions.addContextMenuItems({ a: [same] });

    expect(additions.contextMenuItems).toEqual({ ...DEFAULT_CONTEXT_MENU, a: [first, same] });
  });

  test('keeps a submenu and an item with the same id apart', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [first] });
    additions.addContextMenuItems({ a: [submenu(first.id, 'Menu', { x: [second] })] });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [first, submenu(first.id, 'Menu', { x: [second] })],
    });
  });

  test('keeps submenus with the same id in different groups apart', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    additions.addContextMenuItems({ b: [submenu('menu', 'Menu', { x: [second] })] });

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first] })],
      b: [submenu('menu', 'Menu', { x: [second] })],
    });
  });

  test('removes only the disposed items from a merged submenu', () => {
    const additions = new EditorAdditions();
    additions.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [first] })] });
    const dispose = additions.addContextMenuItems({ a: [submenu('menu', 'Menu', { x: [second], y: [third] })] });
    dispose();

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Menu', { x: [first] })],
    });
  });

  test('keeps a merged submenu when the submenu added first is disposed', () => {
    const additions = new EditorAdditions();
    const dispose = additions.addContextMenuItems({ a: [submenu('menu', 'Original', { x: [first] })] });
    additions.addContextMenuItems({ a: [submenu('menu', 'Other', { x: [second] })] });
    dispose();

    expect(additions.contextMenuItems).toEqual({
      ...DEFAULT_CONTEXT_MENU,
      a: [submenu('menu', 'Other', { x: [second] })],
    });
  });
});
