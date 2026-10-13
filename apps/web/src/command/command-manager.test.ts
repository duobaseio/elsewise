import type { EditorView } from '@codemirror/view';
import type { Platform } from '@elsewise/components/lib/platform';
import type { Keymap, Keys } from '@elsewise/plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';
import { CommandManager } from './command-manager';

const APPEARANCE = new AppearanceManager(
  'dark',
  resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'),
);

// Returns the commands of an application whose editor is `editor`, on `platform`.
function commands(editor = new EditorManager(), platform: Platform = 'linux'): CommandManager {
  return new CommandManager({ appearance: APPEARANCE, editor }, platform);
}

// Returns commands on `platform` with an editor command for each id in `keys`, with those default keys, added in order.
function bound(keys: Record<string, Keys>, platform: Platform = 'linux'): CommandManager {
  const manager = commands(new EditorManager(), platform);
  for (const [id, defaultKeys] of Object.entries(keys)) {
    manager.add([{ id, label: id, scope: 'editor', defaultKeys, run: () => {} }]);
  }

  return manager;
}

// Returns Eclipse's keymap with `keys`.
function eclipse(keys: Keymap['keys']): Keymap {
  return { name: 'Eclipse', keys };
}

// Returns a view that stands in for an editor, named `name`, without a language server.
function view(name: string): EditorView {
  return { name, plugin: () => null } as unknown as EditorView;
}

let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('keys each command by full id', () => {
    const manager = commands();
    const rename = { id: 'io.example.rename', label: 'Rename', scope: 'editor', run: () => {} } as const;
    manager.add([rename]);

    expect(manager.commands.get('io.example.rename')).toBe(rename);
    expect(manager.commands.get('rename')).toBeUndefined();
  });

  test('replaces earlier command with same id', () => {
    const manager = commands();
    manager.add([{ id: 'rename', label: 'First', scope: 'editor', run: () => {} }]);
    manager.add([{ id: 'rename', label: 'Second', scope: 'editor', run: () => {} }]);

    expect(manager.commands.get('rename')?.label).toBe('Second');
  });

  test('removes only disposed commands', () => {
    const manager = commands();
    manager.add([{ id: 'rename', label: 'First', scope: 'editor', run: () => {} }]);
    const dispose = manager.add([
      { id: 'rename', label: 'Second', scope: 'editor', run: () => {} },
      { id: 'format', label: 'Format', scope: 'editor', run: () => {} },
    ]);
    dispose();

    expect(manager.commands.get('rename')?.label).toBe('First');
    expect(manager.commands.get('format')).toBeUndefined();
  });

  test('notifies listeners', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.subscribe(listener);
    const dispose = manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', run: () => {} }]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('removes only disposed addition when added twice', () => {
    const manager = commands();
    const added = [{ id: 'rename', label: 'Rename', scope: 'editor', run: () => {} }] as const;
    manager.add(added);
    const dispose = manager.add(added);
    dispose();

    expect(manager.commands.get('rename')).toBe(added[0]);
  });
});

describe('run', () => {
  test('returns false for unknown id', () => {
    const manager = commands();

    expect(manager.run('unknown')).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('returns false for disabled command', () => {
    const manager = commands();
    const run = vi.fn();
    manager.add([
      { id: 'application', label: 'Application', scope: 'application', enabled: () => false, run },
      { id: 'editor', label: 'Editor', scope: 'editor', enabled: () => false, run },
    ]);

    expect(manager.run('application')).toBe(false);
    expect(manager.run('editor', view('a'))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  test('runs editor command against view, else active editor', () => {
    const editor = new EditorManager();
    const manager = commands(editor);
    const run = vi.fn();
    manager.add([{ id: 'c', label: 'C', scope: 'editor', run }]);
    const active = view('active');
    const target = view('target');

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    editor.activate(active);
    expect(manager.run('c')).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(active);
    expect(run.mock.lastCall?.[2]).toBeNull();

    expect(manager.run('c', target)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(target);
  });

  test('runs application command regardless of view', () => {
    const manager = commands();
    const run = vi.fn();
    manager.add([{ id: 'c', label: 'C', scope: 'application', run }]);

    expect(manager.run('c', view('a'))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  test('logs throwing command and returns true', () => {
    const manager = commands();
    manager.add([
      {
        id: 'throws',
        label: 'Throws',
        scope: 'application',
        run: () => {
          throw new Error('failed');
        },
      },
    ]);

    expect(manager.run('throws')).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('Throws');
  });
});

describe('keymap', () => {
  test('follows selected keymap', () => {
    const manager = bound({ rename: ['Shift-F6'] });
    manager.selected = eclipse({ rename: ['Alt-r'] });

    expect(manager.keymap.name).toBe('Eclipse');
    expect(manager.keymap.commands.get('rename')).toEqual(['Alt-r']);
    expect(manager.keymap.keys.editor.get('Alt-r')).toEqual(['rename']);
  });

  test('lists later-added command first', () => {
    expect(bound({ first: ['Mod-r'], second: ['Ctrl-r'] }).keymap.keys.editor.get('Ctrl-r')).toEqual([
      'second',
      'first',
    ]);
  });

  test('follows added commands', () => {
    const manager = commands();
    const dispose = manager.add([
      { id: 'rename', label: 'Rename', scope: 'editor', defaultKeys: ['Mod-r'], run: () => {} },
    ]);

    expect(manager.keymap.keys.editor.get('Ctrl-r')).toEqual(['rename']);

    dispose();
    expect(manager.keymap.keys.editor.has('Ctrl-r')).toBe(false);
  });
});

describe('onKeymapChange', () => {
  test('calls listener with keymap on change', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.onKeymapChange(listener);
    manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', defaultKeys: ['Mod-r'], run: () => {} }]);

    expect(listener).toHaveBeenCalledExactlyOnceWith(manager.keymap);
    expect(manager.keymap.commands.get('rename')).toEqual(['Mod-r']);
  });

  test('skips unchanged', () => {
    const manager = bound({ format: ['Shift-F6'] });
    const listener = vi.fn();
    manager.onKeymapChange(listener);
    manager.selected = { name: 'Elsewise', keys: { format: ['Shift-F6'] } };
    manager.add([{ id: 'format', label: 'Format', scope: 'application', defaultKeys: ['Shift-F6'], run: () => {} }]);

    expect(listener).not.toHaveBeenCalled();
  });

  test('continues past throwing listener', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.onKeymapChange(() => {
      throw new Error('failed');
    });
    manager.onKeymapChange(listener);
    manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', defaultKeys: ['Mod-r'], run: () => {} }]);

    expect(error).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });
});
