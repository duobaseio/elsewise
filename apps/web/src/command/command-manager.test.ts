import type { EditorView } from '@codemirror/view';
import type { Platform } from '@elsewise/components/lib/platform';
import {
  DEFAULT_COMMAND_GROUPS,
  type EditorCommand,
  type FileTreeCommand,
  type FileTreeSelection,
  type Keys,
  type Project,
  type ProjectCommand,
  type TerminalCommand,
  type Workspace,
  type WorkspaceCommand,
} from '@elsewise/frontend-plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CommandManager } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { builtInApplication, EMPTY_KEYMAP } from '../../test/commands';

const APPLICATION = DEFAULT_COMMAND_GROUPS.application.id;
const EDITOR = DEFAULT_COMMAND_GROUPS.editor.id;
const TERMINAL = DEFAULT_COMMAND_GROUPS.terminal.id;

const PROJECT: Project = { id: { daemon: 'local', project: 'p' }, name: 'p', state: 'ok', absolutePath: '/p' };

const WORKSPACE: Workspace = {
  id: { daemon: 'local', project: 'p', workspace: 'w' },
  name: 'w',
  state: 'ok',
  main: false,
  absolutePath: '/p/w',
};

// Returns the commands of an application whose editor is `editor` and terminal is `terminals`, on `platform`.
function commands(
  editor = new EditorManager(),
  platform: Platform = 'linux',
  terminals = new TerminalManager(),
): CommandManager {
  return builtInApplication({ editor, terminal: terminals }, platform).commands;
}

// Returns commands on `platform` with an editor command for each id in `keys`, with those default keys, added in order.
function bound(keys: Record<string, Keys>, platform: Platform = 'linux'): CommandManager {
  const manager = commands(new EditorManager(), platform);
  for (const [id, defaultKeys] of Object.entries(keys)) {
    manager.add([{ id, label: id, scope: 'editor', group: EDITOR, defaultKeys, run: () => true }]);
  }

  return manager;
}

// Returns a view that stands in for an editor, named `name`, without a language server.
function view(name: string): EditorView {
  return { name, plugin: () => null } as unknown as EditorView;
}

function terminal(name: string): XTerm {
  return { name, buffer: {} } as unknown as XTerm;
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
    const rename = {
      id: 'io.example.rename',
      label: 'Rename',
      scope: 'editor',
      group: EDITOR,
      run: () => true,
    } as const;
    manager.add([rename]);

    expect(manager.commands.get('io.example.rename')).toBe(rename);
    expect(manager.commands.get('rename')).toBeUndefined();
  });

  test('rejects existing id', () => {
    const manager = commands();
    manager.add([{ id: 'rename', label: 'First', scope: 'editor', group: EDITOR, run: () => true }]);
    manager.add([{ id: 'rename', label: 'Second', scope: 'editor', group: EDITOR, run: () => true }]);

    expect(manager.commands.get('rename')?.label).toBe('First');
    expect(warn).toHaveBeenCalledWith('Command rename already exists');
  });

  test('rejects existing id in same addition', () => {
    const manager = commands();
    manager.add([
      { id: 'rename', label: 'First', scope: 'editor', group: EDITOR, run: () => true },
      { id: 'rename', label: 'Second', scope: 'editor', group: EDITOR, run: () => true },
    ]);

    expect(manager.commands.get('rename')?.label).toBe('First');
  });

  test('rejects unknown group', () => {
    const manager = commands();
    manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', group: 'io.example', run: () => true }]);

    expect(manager.commands.has('rename')).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('rejects built-in id', () => {
    const manager = commands();
    const builtIn = manager.commands.get('elsewise.application.settings.open');
    manager.add([
      {
        id: 'elsewise.application.settings.open',
        label: 'Mine',
        scope: 'application',
        group: APPLICATION,
        run: () => true,
      },
    ]);

    expect(manager.commands.get('elsewise.application.settings.open')).toBe(builtIn);
  });

  test('removes only disposed commands', () => {
    const manager = commands();
    manager.add([{ id: 'rename', label: 'First', scope: 'editor', group: EDITOR, run: () => true }]);
    const dispose = manager.add([
      { id: 'rename', label: 'Second', scope: 'editor', group: EDITOR, run: () => true },
      { id: 'format', label: 'Format', scope: 'editor', group: EDITOR, run: () => true },
    ]);
    dispose();

    expect(manager.commands.get('rename')?.label).toBe('First');
    expect(manager.commands.get('format')).toBeUndefined();
  });

  test('forgets rejected command', () => {
    const manager = commands();
    const dispose = manager.add([{ id: 'rename', label: 'First', scope: 'editor', group: EDITOR, run: () => true }]);
    manager.add([{ id: 'rename', label: 'Second', scope: 'editor', group: EDITOR, run: () => true }]);
    dispose();

    expect(manager.commands.get('rename')).toBeUndefined();
  });

  test('notifies listeners', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.subscribe(listener);
    const dispose = manager.add([{ id: 'rename', label: 'Rename', scope: 'editor', group: EDITOR, run: () => true }]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('removes only disposed addition when added twice', () => {
    const manager = commands();
    const added = [{ id: 'rename', label: 'Rename', scope: 'editor', group: EDITOR, run: () => true }] as const;
    manager.add(added);
    const dispose = manager.add(added);
    dispose();

    expect(manager.commands.get('rename')).toBe(added[0]);
  });
});

describe('addGroups', () => {
  test('appends after defaults', () => {
    const manager = commands();
    manager.addGroups([{ id: 'io.example', label: 'Example' }]);

    expect([...manager.groups.keys()].slice(-2)).toEqual([DEFAULT_COMMAND_GROUPS.workspace.id, 'io.example']);
    expect(manager.groups.get('io.example')?.label).toBe('Example');
  });

  test('rejects existing id', () => {
    const manager = commands();
    manager.addGroups([{ id: 'io.example', label: 'First' }]);
    manager.addGroups([{ id: 'io.example', label: 'Second' }]);

    expect(manager.groups.get('io.example')?.label).toBe('First');
    expect(warn).toHaveBeenCalledOnce();
  });

  test('accepts group in built-in or earlier group', () => {
    const manager = commands();
    manager.addGroups([
      { id: 'io.example', in: EDITOR, label: 'Example' },
      { id: 'io.example.tone', in: 'io.example', label: 'Tone' },
    ]);

    expect(manager.groups.get('io.example.tone')?.in).toBe('io.example');
  });

  test('rejects group in unknown group', () => {
    const manager = commands();
    manager.addGroups([
      { id: 'io.example.tone', in: 'io.example', label: 'Tone' },
      { id: 'io.example', label: 'Example' },
    ]);

    expect(manager.groups.has('io.example.tone')).toBe(false);
    expect(manager.groups.has('io.example')).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('removes nested groups and their commands on dispose', () => {
    const manager = commands();
    const dispose = manager.addGroups([{ id: 'a', label: 'A' }]);
    manager.addGroups([
      { id: 'b', in: 'a', label: 'B' },
      { id: 'c', in: 'b', label: 'C' },
      { id: 'd', label: 'D' },
    ]);
    manager.add([
      { id: 'inC', label: 'In C', scope: 'editor', group: 'c', run: () => true },
      { id: 'inD', label: 'In D', scope: 'editor', group: 'd', run: () => true },
    ]);
    dispose();

    expect([...manager.groups.keys()].filter((id) => id.length === 1)).toEqual(['d']);
    expect(manager.commands.has('inC')).toBe(false);
    expect(manager.commands.has('inD')).toBe(true);
  });

  test('keeps disposing commands after group removed some', () => {
    const manager = commands();
    const disposeGroup = manager.addGroups([{ id: 'a', label: 'A' }]);
    const disposeCommands = manager.add([
      { id: 'inA', label: 'In A', scope: 'editor', group: 'a', run: () => true },
      { id: 'inEditor', label: 'In editor', scope: 'editor', group: EDITOR, run: () => true },
    ]);
    disposeGroup();
    disposeCommands();

    expect(manager.commands.has('inEditor')).toBe(false);
  });

  test('notifies listeners', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.subscribe(listener);
    const dispose = manager.addGroups([{ id: 'a', label: 'A' }]);
    dispose();

    expect(listener).toHaveBeenCalledTimes(2);
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
    const run = vi.fn(() => true);
    manager.add([
      {
        id: 'application',
        label: 'Application',
        scope: 'application',
        group: APPLICATION,
        enabled: () => false,
        run,
      },
      { id: 'editor', label: 'Editor', scope: 'editor', group: EDITOR, enabled: () => false, run },
    ]);

    expect(manager.run('application')).toBe(false);
    expect(manager.run('editor', view('a'))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  test('returns false for unapplied command', () => {
    const manager = commands();
    manager.add([
      { id: 'application', label: 'Application', scope: 'application', group: APPLICATION, run: () => false },
      { id: 'editor', label: 'Editor', scope: 'editor', group: EDITOR, run: () => false },
    ]);

    expect(manager.run('application')).toBe(false);
    expect(manager.run('editor', view('a'))).toBe(false);
  });

  test('runs project command against project only', () => {
    const manager = commands();
    const run = vi.fn<ProjectCommand['run']>(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'project', group: APPLICATION, run }]);

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    expect(manager.run('c', PROJECT)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(PROJECT);
  });

  test('runs workspace command against workspace', () => {
    const manager = commands();
    const run = vi.fn<WorkspaceCommand['run']>(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'workspace', group: APPLICATION, run }]);

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    expect(manager.run('c', WORKSPACE)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(WORKSPACE);
  });

  test('runs editor command against view, else active editor', () => {
    const editor = new EditorManager();
    const manager = commands(editor);
    const run = vi.fn<EditorCommand['run']>(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'editor', group: EDITOR, run }]);
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

  test('runs terminal command against terminal, else active terminal', () => {
    const terminals = new TerminalManager();
    const manager = commands(new EditorManager(), 'linux', terminals);
    const run = vi.fn<TerminalCommand['run']>(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'terminal', group: TERMINAL, run }]);
    const active = terminal('active');
    const target = terminal('target');

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    terminals.activate(active);
    expect(manager.run('c')).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(active);

    expect(manager.run('c', target)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(target);
  });

  test('runs file tree command against selection only', () => {
    const manager = commands();
    const run = vi.fn<FileTreeCommand['run']>(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'fileTree', group: APPLICATION, run }]);
    const selection: FileTreeSelection = { workspace: WORKSPACE, paths: ['src/'] };

    expect(manager.run('c')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    expect(manager.run('c', selection)).toBe(true);
    expect(run.mock.lastCall?.[1]).toBe(selection);
  });

  test('refuses target of other surface', () => {
    const manager = commands();
    const run = vi.fn(() => true);
    manager.add([
      { id: 'project', label: 'Project', scope: 'project', group: APPLICATION, run },
      { id: 'workspace', label: 'Workspace', scope: 'workspace', group: APPLICATION, run },
      { id: 'editor', label: 'Editor', scope: 'editor', group: EDITOR, run },
      { id: 'terminal', label: 'Terminal', scope: 'terminal', group: TERMINAL, run },
      { id: 'fileTree', label: 'File tree', scope: 'fileTree', group: APPLICATION, run },
    ]);

    expect(manager.run('project', WORKSPACE)).toBe(false);
    expect(manager.run('workspace', PROJECT)).toBe(false);
    expect(manager.run('editor', PROJECT)).toBe(false);
    expect(manager.run('editor', { workspace: WORKSPACE, paths: [] })).toBe(false);
    expect(manager.run('editor', terminal('a'))).toBe(false);
    expect(manager.run('terminal', view('a'))).toBe(false);
    expect(manager.run('fileTree', WORKSPACE)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(7);
  });

  test('runs application command regardless of view', () => {
    const manager = commands();
    const run = vi.fn(() => true);
    manager.add([{ id: 'c', label: 'C', scope: 'application', group: APPLICATION, run }]);

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
        group: APPLICATION,
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
    manager.selected = { name: 'Eclipse', keys: { rename: ['Alt-r'] } };

    expect(manager.keymap.name).toBe('Eclipse');
    expect(manager.keymap.commands.get('rename')).toEqual(['Alt-r']);
    expect(manager.keymap.keys.editor.get('Alt-r')).toEqual(['rename']);
  });

  test('lists later-added command first', () => {
    expect(bound({ first: ['Mod-k'], second: ['Ctrl-k'] }).keymap.keys.editor.get('Ctrl-k')).toEqual([
      'second',
      'first',
    ]);
  });

  test('follows added commands', () => {
    const manager = commands();
    const dispose = manager.add([
      { id: 'rename', label: 'Rename', scope: 'editor', group: EDITOR, defaultKeys: ['Mod-k'], run: () => true },
    ]);

    expect(manager.keymap.keys.editor.get('Ctrl-k')).toEqual(['rename']);

    dispose();
    expect(manager.keymap.keys.editor.has('Ctrl-k')).toBe(false);
  });
});

describe('onKeymapChange', () => {
  test('calls listener with changed keymap', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.onKeymapChange(listener);
    manager.add([
      { id: 'rename', label: 'Rename', scope: 'editor', group: EDITOR, defaultKeys: ['Mod-r'], run: () => true },
    ]);

    expect(listener).toHaveBeenCalledExactlyOnceWith(manager.keymap);
    expect(manager.keymap.commands.get('rename')).toEqual(['Mod-r']);
  });

  test('ignores unchanged keymap', () => {
    const manager = bound({ format: ['Shift-F6'] });
    const listener = vi.fn();
    manager.onKeymapChange(listener);
    manager.selected = { ...EMPTY_KEYMAP, keys: { format: ['Shift-F6'] } };
    manager.add([
      {
        id: 'format',
        label: 'Format',
        scope: 'application',
        group: APPLICATION,
        defaultKeys: ['Shift-F6'],
        run: () => true,
      },
    ]);

    expect(listener).not.toHaveBeenCalled();
  });

  test('continues past throwing listener', () => {
    const manager = commands();
    const listener = vi.fn();
    manager.onKeymapChange(() => {
      throw new Error('failed');
    });
    manager.onKeymapChange(listener);
    manager.add([
      { id: 'rename', label: 'Rename', scope: 'editor', group: EDITOR, defaultKeys: ['Mod-r'], run: () => true },
    ]);

    expect(error).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });
});
