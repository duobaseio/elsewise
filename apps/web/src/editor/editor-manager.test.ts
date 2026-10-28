import { EditorView } from '@codemirror/view';
import type { ContextMenuGroup, ContextMenuItem, EditorToolbarItem } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_CONTEXT_MENU } from '@/editor/default-context-menu';
import { EditorManager } from '@/editor/editor-manager';

// Returns an item that runs the command with `id`.
function item(id: string): ContextMenuItem {
  return { command: id };
}

// Returns the group `id` with `items` and the `rest` of its fields.
function group(id: string, items: ContextMenuItem[], rest: Partial<ContextMenuGroup> = {}): ContextMenuGroup {
  return { id, ...rest, items };
}

// Returns a view that stands in for an editor, named `name`.
function view(name: string): EditorView {
  return { name } as unknown as EditorView;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activate', () => {
  test('ignores active view', () => {
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
  test('clears and notifies for active view', () => {
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

describe('addContextMenu', () => {
  test('adds groups until disposed', () => {
    const editor = new EditorManager();
    const added = [group('a', [item('first')]), group('b', [item('second')], { order: 1, in: 'menu' })];
    const dispose = editor.addContextMenu(added);

    expect(editor.contextMenu).toEqual([...DEFAULT_CONTEXT_MENU, ...added]);

    dispose();

    expect(editor.contextMenu).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('appends same-group items in order added', () => {
    const editor = new EditorManager();
    editor.addContextMenu([group('a', [item('first')])]);
    editor.addContextMenu([group('a', [item('second')])]);

    expect(editor.contextMenu).toContainEqual(group('a', [item('first'), item('second')]));
  });

  test('removes only disposed items from group', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenu([group('a', [item('first')])]);
    editor.addContextMenu([group('a', [item('second')])]);
    dispose();

    expect(editor.contextMenu).toContainEqual(group('a', [item('second')]));
  });

  test('removes only disposed addition when added twice', () => {
    const editor = new EditorManager();
    const added = [group('a', [item('first')])];
    const dispose = editor.addContextMenu(added);
    editor.addContextMenu(added);
    dispose();

    expect(editor.contextMenu).toContainEqual(group('a', [item('first')]));
  });

  test('takes first defined order and submenu', () => {
    const editor = new EditorManager();
    editor.addContextMenu([group('a', [item('first')])]);
    editor.addContextMenu([group('a', [item('second')], { order: 1, in: 'menu' })]);

    expect(editor.contextMenu).toContainEqual(group('a', [item('first'), item('second')], { order: 1, in: 'menu' }));
  });

  test('keeps first order and submenu and warns on differing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenu([group('a', [], { order: 1, in: 'menu' })]);
    editor.addContextMenu([group('a', [], { order: 2, in: 'other' })]);

    expect(editor.contextMenu).toContainEqual(group('a', [], { order: 1, in: 'menu' }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring 2'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoring other'));
  });

  test('ignores repeated order and submenu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = new EditorManager();
    editor.addContextMenu([group('a', [], { order: 1, in: 'menu' })]);
    editor.addContextMenu([group('a', [], { order: 1, in: 'menu' })]);

    expect(warn).not.toHaveBeenCalled();
  });

  test('takes later order once first disposed', () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenu([group('a', [], { order: 1 })]);
    editor.addContextMenu([group('a', [], { order: 2 })]);
    dispose();

    expect(editor.contextMenu).toContainEqual(group('a', [], { order: 2 }));
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
