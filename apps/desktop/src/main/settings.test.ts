import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { configLocalDir, dataLocalDir } from '@elsewise/fs';
import { ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { handleSettings } from './settings';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
// The real `writeJsonSync`, but in a temporary folder rather than the user's config and data folders.
vi.mock('@elsewise/fs', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'elsewise-'));
  return {
    ...(await importOriginal<typeof import('@elsewise/fs')>()),
    configLocalDir: () => join(home, 'config'),
    dataLocalDir: () => join(home, 'data'),
  };
});

const FILE = path.join(configLocalDir(), 'settings.json');
const PLUGIN_FILE = path.join(dataLocalDir(), 'plugins', 'hello', 'settings.json');

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(configLocalDir(), { recursive: true, force: true });
  fs.rmSync(dataLocalDir(), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(path.dirname(configLocalDir()), { recursive: true, force: true });
});

// Returns the handler `handleSettings` registers for `channel`.
function handler(channel: string) {
  handleSettings();

  return vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1] as unknown as (
    event?: unknown,
    ...values: unknown[]
  ) => unknown;
}

function load() {
  return handler('settings:load')();
}

function save(settings: unknown) {
  handler('settings:save')({}, settings);
}

describe('settings:load', () => {
  test('returns the defaults when there is no file', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(load()).toEqual(DEFAULT_SETTINGS);
    expect(error).not.toHaveBeenCalled();
  });

  test('returns the defaults when the file is not JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.mkdirSync(configLocalDir(), { recursive: true });
    fs.writeFileSync(FILE, '{not json');

    expect(load()).toEqual(DEFAULT_SETTINGS);
    expect(error).toHaveBeenCalledOnce();
  });

  test('keeps valid leaves and fills the missing ones', () => {
    write({ appearance: { general: { brightness: 'dark', theme: { source: 'elsewise', name: 'dracula' } } } });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: {
          ...DEFAULT_SETTINGS.appearance.general,
          brightness: 'dark',
          theme: { source: 'elsewise', name: 'dracula' },
        },
      },
    });
  });

  test('replaces invalid leaves with their default and keeps the rest', () => {
    write({
      appearance: { general: { brightness: 'sepia', theme: '', font: { family: 'Inter', size: 99, ligatures: true } } },
    });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, font: { family: 'Inter', size: 13, ligatures: true } },
      },
    });
  });

  test('replaces a non-object font with the default and keeps the rest', () => {
    write({ appearance: { general: { brightness: 'dark', font: 'Inter' } } });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'dark' },
      },
    });
  });

  test('drops unknown keys', () => {
    write({ appearance: { general: { brightness: 'light', extra: 1 }, junk: true }, junk: true });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
      },
    });
  });

  test('returns the defaults when the file is not an object', () => {
    for (const bad of [null, [], 'dark']) {
      write(bad);
      expect(load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  test('returns the defaults when a section is not an object', () => {
    write({ appearance: 'dark' });
    expect(load()).toEqual(DEFAULT_SETTINGS);

    write({ appearance: { general: 'dark', terminal: { cursorStyle: 'bar' } } });
    expect(load()).toEqual(DEFAULT_SETTINGS);
  });

  test('lets the editor and terminal follow the interface theme or name their own', () => {
    write({ appearance: { editor: { theme: { source: 'elsewise', name: 'dracula' } }, terminal: { theme: null } } });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: { ...DEFAULT_SETTINGS.appearance.editor, theme: { source: 'elsewise', name: 'dracula' } },
      },
    });

    for (const bad of [{ editor: { theme: '' } }, { terminal: { theme: 7 } }, { general: { theme: null } }]) {
      write({ appearance: bad });
      expect(load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  test('keeps a theme a plugin provides and replaces a malformed theme', () => {
    const theme = { source: 'plugin', plugin: 'com.acme.themes', name: 'nord' };
    write({ appearance: { general: { theme } } });
    expect(load()).toEqual({
      appearance: { ...DEFAULT_SETTINGS.appearance, general: { ...DEFAULT_SETTINGS.appearance.general, theme } },
    });

    for (const bad of [
      'elsewise/elsewise',
      { source: 'elsewise', name: '' },
      { source: 'elsewise', name: 'nord' },
      { source: 'acme', name: 'nord' },
      { source: 'plugin', name: 'nord' },
      { source: 'plugin', plugin: '../acme', name: 'nord' },
      { source: 'elsewise', plugin: 'com.acme.themes', name: 'dracula' },
      { source: 'elsewise', name: 'dracula', extra: 1 },
    ]) {
      write({ appearance: { general: { theme: bad } } });
      expect(load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  test('keeps language overrides it does not know and drops the leaves it cannot read', () => {
    write({
      appearance: {
        editor: {
          languages: {
            Markdown: { tabSize: 'wide', lineSeparator: '\n', extra: 1 },
            Brainfuck: { visualGuides: [80] },
            Rust: 'wrap',
          },
        },
      },
    });

    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: {
          ...DEFAULT_SETTINGS.appearance.editor,
          languages: { Markdown: { lineSeparator: '\n' }, Brainfuck: { visualGuides: [80] }, Rust: {} },
        },
      },
    });
    // A leaf that is dropped leaves no key behind, which would override the editor's own value when spread.
    expect(Object.keys((load() as Settings).appearance.editor.languages.Markdown)).toEqual(['lineSeparator']);
  });

  test('keeps a valid guide list and replaces a bad one', () => {
    write({ appearance: { editor: { visualGuides: [80, 120], languages: { Markdown: { visualGuides: [72] } } } } });
    expect(load()).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: {
          ...DEFAULT_SETTINGS.appearance.editor,
          visualGuides: [80, 120],
          languages: { Markdown: { visualGuides: [72] } },
        },
      },
    });

    for (const bad of [[80, 501], 80, [1.5]]) {
      write({ appearance: { editor: { visualGuides: bad } } });
      expect(load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  test('keeps valid terminal leaves and replaces bad ones', () => {
    const terminal = {
      theme: { source: 'elsewise', name: 'dracula' },
      font: { family: 'Iosevka', size: 16, ligatures: false },
      cursorStyle: 'bar',
      cursorBlink: false,
      scrollback: 50000,
    };
    write({ appearance: { terminal } });
    expect(load()).toEqual({ appearance: { ...DEFAULT_SETTINGS.appearance, terminal } });

    for (const bad of [
      { cursorStyle: 'beam' },
      { cursorBlink: 'yes' },
      { scrollback: 999 },
      { scrollback: 100001 },
      { scrollback: 5000.5 },
    ]) {
      write({ appearance: { terminal: bad } });
      expect(load()).toEqual(DEFAULT_SETTINGS);
    }
  });

  test('replaces a non-object language map with the default', () => {
    write({ appearance: { editor: { languages: [] } } });

    expect(load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings:save', () => {
  test('writes the settings and drops unknown keys', () => {
    const general = {
      ...DEFAULT_SETTINGS.appearance.general,
      brightness: 'dark',
      font: { family: 'Inter', size: 16, ligatures: true },
    };
    save({ appearance: { ...DEFAULT_SETTINGS.appearance, general: { ...general, extra: 1 } } });

    const expected = { appearance: { ...DEFAULT_SETTINGS.appearance, general } };
    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual(expected);
    expect(load()).toEqual(expected);
  });

  test('fills missing leaves with their default', () => {
    save({ appearance: { general: { brightness: 'light' } } });

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
      },
    });
  });

  test('replaces an invalid leaf with its default', () => {
    save({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { brightness: 'sepia', theme: null, font: { family: '', size: 16, ligatures: 'yes' } },
        terminal: { ...DEFAULT_SETTINGS.appearance.terminal, cursorStyle: 'bar', scrollback: 100001 },
      },
    });

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual({
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, font: { family: null, size: 16, ligatures: true } },
        terminal: { ...DEFAULT_SETTINGS.appearance.terminal, cursorStyle: 'bar' },
      },
    });
  });

  test('refuses settings or a section that is not an object and writes nothing', () => {
    expect(() => save('dark')).toThrow();
    expect(() => save({ appearance: { general: 'dark' } })).toThrow();
    expect(fs.existsSync(FILE)).toBe(false);
  });

  test('leaves no temporary file behind', () => {
    save(DEFAULT_SETTINGS);

    expect(fs.readdirSync(configLocalDir())).toEqual(['settings.json']);
  });
});

describe('settings:load-plugin', () => {
  test('returns undefined when the plugin has no settings', () => {
    expect(handler('settings:load-plugin')({}, 'hello')).toBeUndefined();
  });

  test('returns the settings in the plugin’s file', () => {
    fs.mkdirSync(path.dirname(PLUGIN_FILE), { recursive: true });
    fs.writeFileSync(PLUGIN_FILE, JSON.stringify({ greeting: 'hi', times: [1, 2] }));

    expect(handler('settings:load-plugin')({}, 'hello')).toEqual({ greeting: 'hi', times: [1, 2] });
  });

  test('throws when the file cannot be read', () => {
    fs.mkdirSync(PLUGIN_FILE, { recursive: true });

    expect(() => handler('settings:load-plugin')({}, 'hello')).toThrow(/EISDIR/);
  });

  test.each(['', '..', '../other', 'a/b', 'a\\b', '.hidden', 7, undefined])('throws for the id %j', (id) => {
    expect(() => handler('settings:load-plugin')({}, id)).toThrow(/invalid plugin id/);
  });
});

describe('settings:save-plugin', () => {
  test('writes the settings beside the plugin and reads them back', () => {
    handler('settings:save-plugin')({}, 'com.acme.hello', { greeting: 'hi' });

    const file = path.join(dataLocalDir(), 'plugins', 'com.acme.hello', 'settings.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ greeting: 'hi' });
    expect(handler('settings:load-plugin')({}, 'com.acme.hello')).toEqual({ greeting: 'hi' });
  });

  test('throws and writes nothing for a value that is not JSON', () => {
    expect(() => handler('settings:save-plugin')({}, 'hello', undefined)).toThrow(/not JSON/);
    expect(() => handler('settings:save-plugin')({}, 'hello', () => {})).toThrow(/not JSON/);
    expect(fs.existsSync(PLUGIN_FILE)).toBe(false);
  });

  test.each(['', '..', '../other', 'a/b'])('throws for the id %j', (id) => {
    expect(() => handler('settings:save-plugin')({}, id, {})).toThrow(/invalid plugin id/);
  });
});

function write(settings: unknown) {
  fs.mkdirSync(configLocalDir(), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(settings));
}
