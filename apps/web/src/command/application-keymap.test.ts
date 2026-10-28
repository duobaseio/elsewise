import type { Platform } from '@elsewise/components/lib/platform';
import { type ApplicationCommand, type EditorCommand, Keymap, type Keys } from '@elsewise/plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApplicationKeymap } from '@/command/application-keymap';

const ELSEWISE: Keymap = { name: 'Elsewise', keys: {} };

// Returns an editor command for each id in `keys`, with those default keys.
function editor(keys: Record<string, Keys>): EditorCommand[] {
  return Object.entries(keys).map(([id, defaultKeys]) => ({
    id,
    label: id,
    scope: 'editor',
    defaultKeys,
    run: () => true,
  }));
}

// Returns a keymap on `platform` updated with `commands` under `keymap`.
function updated(
  commands: readonly (ApplicationCommand | EditorCommand)[],
  keymap: Keymap = ELSEWISE,
  platform: Platform = 'linux',
): ApplicationKeymap {
  const active = new ApplicationKeymap(platform);
  active.update(keymap, commands);
  return active;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('commands', () => {
  test('uses default keys without entry', () => {
    const keymap = updated(editor({ rename: ['Shift-F6'], format: ['Mod-l'] }), {
      name: 'Eclipse',
      keys: { rename: ['Alt-r', 'Mod-Shift-r'] },
    });

    expect(keymap.commands.get('rename')).toEqual(['Alt-r', 'Mod-Shift-r']);
    expect(keymap.commands.get('format')).toEqual(['Mod-l']);
  });

  test('lists keys of every command', () => {
    const keymap = updated(editor({ rename: ['Mod-r', 'Cmd-L'], save: [] }));

    expect(keymap.name).toBe('Elsewise');
    expect(keymap.commands).toEqual(
      new Map([
        ['rename', ['Mod-r', 'Cmd-L']],
        ['save', []],
      ]),
    );
  });

  test('prefers platform slot over key', () => {
    const keys: Keys = [{ key: 'Mod-r', mac: 'Cmd-Alt-r', windows: 'Ctrl-Alt-r' }, 'F2'];
    const expected = { mac: ['Cmd-Alt-r', 'F2'], windows: ['Ctrl-Alt-r', 'F2'], linux: ['Mod-r', 'F2'] } as const;

    for (const platform of ['mac', 'windows', 'linux'] as const) {
      expect(updated(editor({ rename: keys }), ELSEWISE, platform).commands.get('rename')).toEqual(expected[platform]);
      expect(
        updated(editor({ rename: [] }), { name: 'Eclipse', keys: { rename: keys } }, platform).commands.get('rename'),
      ).toEqual(expected[platform]);
    }
  });

  test('skips platform key without slot for platform', () => {
    const keys: Keys = ['Mod-x', { windows: 'Shift-Delete', linux: 'Shift-Delete' }];

    expect(updated(editor({ cut: keys }), ELSEWISE, 'mac').commands.get('cut')).toEqual(['Mod-x']);
    expect(updated(editor({ cut: keys }), ELSEWISE, 'linux').commands.get('cut')).toEqual(['Mod-x', 'Shift-Delete']);
  });

  test('uses default keys for invalid entry', () => {
    const keymap = updated(
      editor({ rename: ['Shift-F6'] }),
      Keymap.parse({ name: 'Eclipse', keys: { rename: 'Alt-r' } }),
    );

    expect(keymap.commands.get('rename')).toEqual(['Shift-F6']);
  });

  test('unbinds on empty array', () => {
    const keymap = updated(editor({ rename: ['Shift-F6'] }), { name: 'Eclipse', keys: { rename: [] } });

    expect(keymap.commands.get('rename')).toEqual([]);
    expect(keymap.keys.editor.size).toBe(0);
  });

  test('skips invalid key', () => {
    const keymap = updated(editor({ rename: ['Hyper-r', 'Shift-F6'] }));

    expect(keymap.commands.get('rename')).toEqual(['Shift-F6']);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('Hyper-r');
  });

  test('ignores entry for unknown command', () => {
    const keymap = updated(editor({ rename: ['Mod-r'] }), { name: 'Eclipse', keys: { unknown: ['Mod-u'] } });

    expect(keymap.commands.has('unknown')).toBe(false);
    expect([...keymap.keys.editor]).toEqual([['Ctrl-r', ['rename']]]);
  });

  test('keeps unchanged commands', () => {
    const keymap = updated(editor({ rename: ['Mod-r'] }));
    const commands = keymap.commands;
    keymap.update({ name: 'Elsewise', keys: { rename: ['Mod-r'] } }, [
      { id: 'rename', label: 'Rename', scope: 'application', defaultKeys: ['Mod-r'], run: () => true },
    ]);

    expect(keymap.commands).toBe(commands);
    expect(keymap.keys.editor.size).toBe(0);
  });

  test('replaces changed commands', () => {
    const keymap = updated(editor({ rename: ['Mod-r'] }));
    const initial = keymap.commands;
    keymap.update(ELSEWISE, editor({ rename: ['Mod-r'], format: ['Shift-F6'] }));
    const added = keymap.commands;
    keymap.update({ name: 'Eclipse', keys: {} }, editor({ rename: ['Mod-r'], format: ['Shift-F6'] }));

    expect(added).not.toBe(initial);
    expect(keymap.commands).not.toBe(added);
    expect(keymap.name).toBe('Eclipse');
  });
});

describe('keys', () => {
  test('resolves Mod per platform', () => {
    expect([...updated(editor({ rename: ['Mod-r'] }), ELSEWISE, 'mac').keys.editor]).toEqual([['Meta-r', ['rename']]]);
    expect([...updated(editor({ rename: ['Mod-r'] })).keys.editor]).toEqual([['Ctrl-r', ['rename']]]);
  });

  test('lists later-added command first', () => {
    expect(updated(editor({ first: ['Mod-r'], second: ['Ctrl-r'] })).keys.editor.get('Ctrl-r')).toEqual([
      'second',
      'first',
    ]);
  });

  test('separates scopes', () => {
    const keymap = updated([
      ...editor({ rename: ['Mod-r'] }),
      { id: 'settings', label: 'Settings', scope: 'application', defaultKeys: ['Mod-,'], run: () => true },
    ]);

    expect([...keymap.keys.editor]).toEqual([['Ctrl-r', ['rename']]]);
    expect([...keymap.keys.application]).toEqual([['Ctrl-,', ['settings']]]);
  });
});
