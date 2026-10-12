import type { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';
import { CommandManager } from './command-manager';

const APPEARANCE = new AppearanceManager('dark', resolveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'));

// Returns a view that stands in for an editor, named `name`.
function view(name: string): EditorView {
  return { name } as unknown as EditorView;
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
    const manager = new CommandManager(APPEARANCE, new EditorManager());
    const rename = { id: 'io.example.rename', label: 'Rename', scope: 'editor', run: () => {} } as const;
    manager.add([rename]);

    expect(manager.commands.get('io.example.rename')).toBe(rename);
    expect(manager.commands.get('rename')).toBeUndefined();
  });

  test('replaces earlier command with same id', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
    manager.add([{ id: 'rename', label: 'First', scope: 'editor', run: () => {} }]);
    manager.add([{ id: 'rename', label: 'Second', scope: 'editor', run: () => {} }]);

    expect(manager.commands.get('rename')?.label).toBe('Second');
  });

  test('removes only disposed commands', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
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
    const manager = new CommandManager(APPEARANCE, new EditorManager());
    const listener = vi.fn();
    manager.subscribe(listener);
    const dispose = manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', run: () => {} }]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('removes only disposed addition when added twice', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
    const commands = [{ id: 'rename', label: 'Rename', scope: 'editor', run: () => {} }] as const;
    manager.add(commands);
    const dispose = manager.add(commands);
    dispose();

    expect(manager.commands.get('rename')).toBe(commands[0]);
  });
});

describe('run', () => {
  test('returns false for unknown id', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());

    expect(manager.run('unknown')).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('returns false for disabled command', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
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
    const manager = new CommandManager(APPEARANCE, editor);
    const run = vi.fn();
    manager.add([{ id: 'c', label: 'C', scope: 'editor', run }]);
    const active = view('active');
    const target = view('target');

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    editor.activate(active);
    expect(manager.run('c')).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(active);

    expect(manager.run('c', target)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(target);
  });

  test('runs application command regardless of view', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
    const run = vi.fn();
    manager.add([{ id: 'c', label: 'C', scope: 'application', run }]);

    expect(manager.run('c', view('a'))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  test('logs throwing command and returns true', () => {
    const manager = new CommandManager(APPEARANCE, new EditorManager());
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
