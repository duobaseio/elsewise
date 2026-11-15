import fs from 'node:fs';
import path from 'node:path';
import { configLocalDir, frontendDataDir } from '@elsewise/core/node';
import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { BrowserWindow, ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { handleSettings, watchUserThemesAndKeymaps } from './settings';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: vi.fn() }, ipcMain: { handle: vi.fn() } }));
// The real `writeJsonSync`, but in a temporary folder rather than the user's config and data folders.
vi.mock('@elsewise/core/node', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'elsewise-'));
  return {
    ...(await importOriginal<typeof import('@elsewise/core/node')>()),
    configLocalDir: () => join(home, 'config'),
    frontendDataDir: () => join(home, 'frontend'),
  };
});

const FILE = path.join(configLocalDir(), 'settings.json');
const PLUGIN_FILE = path.join(frontendDataDir(), 'plugins', 'hello', 'settings.json');

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(configLocalDir(), { recursive: true, force: true });
  fs.rmSync(frontendDataDir(), { recursive: true, force: true });
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

    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    expect(error).not.toHaveBeenCalled();
  });

  test('returns the defaults when the file is not JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.mkdirSync(configLocalDir(), { recursive: true });
    fs.writeFileSync(FILE, '{not json');

    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    expect(error).toHaveBeenCalledOnce();
  });

  test('keeps valid leaves and fills the missing ones', () => {
    write({ appearance: { brightness: 'dark', theme: { source: 'elsewise', id: 'dracula' } } });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: {
        ...DEFAULT_FRONTEND_SETTINGS.appearance,
        brightness: 'dark',
        theme: { source: 'elsewise', id: 'dracula' },
      },
    });
  });

  test('replaces invalid leaves with their default and keeps the rest', () => {
    write({ appearance: { brightness: 'sepia', theme: '', font: { family: 'Inter', size: 99, ligatures: true } } });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, font: { family: 'Inter', size: 13, ligatures: true } },
    });
  });

  test('replaces a non-object font with the default and keeps the rest', () => {
    write({ appearance: { brightness: 'dark', font: 'Inter' } });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, brightness: 'dark' },
    });
  });

  test('drops unknown keys', () => {
    write({ appearance: { brightness: 'light', extra: 1 }, junk: true });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, brightness: 'light' },
    });
  });

  test('returns the defaults when the file is not an object', () => {
    for (const bad of [null, [], 'dark']) {
      write(bad);
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('returns the defaults when a section is not an object', () => {
    write({ appearance: 'dark' });
    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);

    write({ appearance: 'dark', terminal: { cursorStyle: 'bar' } });
    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
  });

  test('lets the editor and terminal follow the interface theme or name their own', () => {
    write({ editor: { theme: { source: 'elsewise', id: 'dracula' } }, terminal: { theme: null } });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: { ...DEFAULT_FRONTEND_SETTINGS.editor, theme: { source: 'elsewise', id: 'dracula' } },
    });

    for (const bad of [{ editor: { theme: '' } }, { terminal: { theme: 7 } }, { appearance: { theme: null } }]) {
      write(bad);
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('keeps a theme the user or a plugin provides and replaces a malformed theme', () => {
    for (const theme of [
      { source: 'user', id: 'nord' },
      { source: 'plugin', plugin: 'com.acme.themes', id: 'nord' },
    ]) {
      write({ appearance: { theme } });
      expect(load()).toEqual({
        ...DEFAULT_FRONTEND_SETTINGS,
        appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, theme },
      });
    }

    for (const bad of [
      'elsewise/elsewise',
      { source: 'elsewise', id: '' },
      { source: 'elsewise', id: 'nord' },
      { source: 'acme', id: 'nord' },
      { source: 'plugin', id: 'nord' },
      { source: 'plugin', plugin: '../acme', id: 'nord' },
      { source: 'elsewise', plugin: 'com.acme.themes', id: 'dracula' },
      { source: 'elsewise', id: 'dracula', extra: 1 },
      { source: 'user', id: '' },
      { source: 'user', plugin: 'com.acme.themes', id: 'nord' },
    ]) {
      write({ appearance: { theme: bad } });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('keeps valid keymap and replaces malformed one', () => {
    expect(DEFAULT_FRONTEND_SETTINGS.keymap).toEqual({ source: 'elsewise', id: 'elsewise' });

    for (const keymap of [
      { source: 'user', id: 'Eclipse' },
      { source: 'plugin', plugin: 'io.example', id: 'Eclipse' },
    ]) {
      write({ keymap });
      expect(load()).toEqual({ ...DEFAULT_FRONTEND_SETTINGS, keymap });
    }

    for (const bad of [
      'elsewise',
      { source: 'elsewise', id: 'Eclipse' },
      { source: 'user', id: '' },
      { source: 'plugin', id: 'Eclipse' },
      { source: 'plugin', plugin: 'io.example', id: '' },
      { source: 'plugin', plugin: 'io.example', id: 'Eclipse', extra: 1 },
    ]) {
      write({ keymap: bad });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('keeps language overrides it does not know and drops the leaves it cannot read', () => {
    write({
      editor: {
        languages: {
          Markdown: { tabSize: 'wide', lineSeparator: '\n', extra: 1 },
          Brainfuck: { visualGuides: [80] },
          Rust: 'wrap',
        },
      },
    });

    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: {
        ...DEFAULT_FRONTEND_SETTINGS.editor,
        languages: { Markdown: { lineSeparator: '\n' }, Brainfuck: { visualGuides: [80] }, Rust: {} },
      },
    });
    // A leaf that is dropped leaves no key behind, which would override the editor's own value when spread.
    expect(Object.keys((load() as FrontendSettings).editor.languages.Markdown)).toEqual(['lineSeparator']);
  });

  test('keeps a valid guide list and replaces a bad one', () => {
    write({ editor: { visualGuides: [80, 120], languages: { Markdown: { visualGuides: [72] } } } });
    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: {
        ...DEFAULT_FRONTEND_SETTINGS.editor,
        visualGuides: [80, 120],
        languages: { Markdown: { visualGuides: [72] } },
      },
    });

    for (const bad of [[80, 501], 80, [1.5]]) {
      write({ editor: { visualGuides: bad } });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('drops repeated hidden globs', () => {
    write({ fileTree: { hidden: ['dist', '.git', 'dist'] } });
    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      fileTree: { ...DEFAULT_FRONTEND_SETTINGS.fileTree, hidden: ['dist', '.git'] },
    });
  });

  test('keeps a valid completion documentation toggle and turns a bad or missing one on', () => {
    write({ editor: { completionDocumentation: false } });
    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: { ...DEFAULT_FRONTEND_SETTINGS.editor, completionDocumentation: false },
    });

    for (const editor of [{ completionDocumentation: 'yes' }, {}]) {
      write({ editor });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
      expect((load() as FrontendSettings).editor.completionDocumentation).toBe(true);
    }
  });

  test('keeps a valid usage highlighting toggle and turns a bad or missing one on', () => {
    write({ editor: { highlightUsages: false } });
    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: { ...DEFAULT_FRONTEND_SETTINGS.editor, highlightUsages: false },
    });

    for (const editor of [{ highlightUsages: 'yes' }, {}]) {
      write({ editor });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
      expect((load() as FrontendSettings).editor.highlightUsages).toBe(true);
    }
  });

  test('keeps valid terminal leaves and replaces bad ones', () => {
    const terminal = {
      theme: { source: 'elsewise', id: 'dracula' },
      font: { family: 'Iosevka', size: 16, lineHeight: 1.2, ligatures: false },
      cursorStyle: 'bar',
      cursorBlink: false,
      copyOnSelect: true,
      macOptionClickForcesSelection: true,
      macOptionIsMeta: true,
      scrollback: 50000,
    };
    write({ terminal });
    expect(load()).toEqual({ ...DEFAULT_FRONTEND_SETTINGS, terminal });

    for (const bad of [
      { cursorStyle: 'beam' },
      { cursorBlink: 'yes' },
      { copyOnSelect: 'yes' },
      { macOptionClickForcesSelection: 'yes' },
      { macOptionIsMeta: 'yes' },
      { scrollback: 999 },
      { scrollback: 100001 },
      { scrollback: 5000.5 },
    ]) {
      write({ terminal: bad });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('keeps a valid line height and replaces a bad one', () => {
    write({ editor: { font: { lineHeight: 1.8 } } });
    expect(load()).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      editor: {
        ...DEFAULT_FRONTEND_SETTINGS.editor,
        font: { ...DEFAULT_FRONTEND_SETTINGS.editor.font, lineHeight: 1.8 },
      },
    });

    for (const lineHeight of [0.9, 2.6, '1.5']) {
      write({ editor: { font: { lineHeight } }, terminal: { font: { lineHeight } } });
      expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
    }
  });

  test('drops the interface font line height', () => {
    write({ appearance: { font: { lineHeight: 2 } } });

    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
  });

  test('replaces a non-object language map with the default', () => {
    write({ editor: { languages: [] } });

    expect(load()).toEqual(DEFAULT_FRONTEND_SETTINGS);
  });
});

describe('settings:save', () => {
  test('writes the settings and drops unknown keys', () => {
    const appearance = {
      ...DEFAULT_FRONTEND_SETTINGS.appearance,
      brightness: 'dark',
      font: { family: 'Inter', size: 16, ligatures: true },
    };
    save({ ...DEFAULT_FRONTEND_SETTINGS, appearance: { ...appearance, extra: 1 } });

    const expected = { ...DEFAULT_FRONTEND_SETTINGS, appearance };
    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual(expected);
    expect(load()).toEqual(expected);
  });

  test('fills missing leaves with their default', () => {
    save({ appearance: { brightness: 'light' } });

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, brightness: 'light' },
    });
  });

  test('replaces an invalid leaf with its default', () => {
    save({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { brightness: 'sepia', theme: null, font: { family: '', size: 16, ligatures: 'yes' } },
      terminal: { ...DEFAULT_FRONTEND_SETTINGS.terminal, cursorStyle: 'bar', scrollback: 100001 },
    });

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual({
      ...DEFAULT_FRONTEND_SETTINGS,
      appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, font: { family: null, size: 16, ligatures: true } },
      terminal: { ...DEFAULT_FRONTEND_SETTINGS.terminal, cursorStyle: 'bar' },
    });
  });

  test('refuses settings or a section that is not an object and writes nothing', () => {
    expect(() => save('dark')).toThrow();
    expect(() => save({ appearance: 'dark' })).toThrow();
    expect(fs.existsSync(FILE)).toBe(false);
  });

  test('leaves no temporary file behind', () => {
    save(DEFAULT_FRONTEND_SETTINGS);

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

    const file = path.join(frontendDataDir(), 'plugins', 'com.acme.hello', 'settings.json');
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

describe.each([
  {
    kind: 'theme',
    folder: 'themes',
    content: { name: 'Dusk', dark: { interface: { background: '#1c2430' }, editor: {}, terminal: {} } },
  },
  { kind: 'keymap', folder: 'keymaps', content: { name: 'Emacs', keys: { 'io.example.rename': ['Ctrl-r'] } } },
])('user $folder', ({ kind, folder, content }) => {
  const load = () => handler(`settings:load-user-${folder}`)();
  const save = (id: unknown, value: unknown) => handler(`settings:save-user-${kind}`)({}, id, value);
  const del = (id: unknown) => handler(`settings:delete-user-${kind}`)({}, id);

  test('returns none when the folder does not exist', () => {
    expect(load()).toEqual([]);
  });

  test('saves, loads and deletes', () => {
    save('dusk', content);
    expect(JSON.parse(fs.readFileSync(path.join(configLocalDir(), folder, 'dusk.json'), 'utf8'))).toEqual(content);
    expect(load()).toEqual([{ id: 'dusk', [kind]: content }]);

    del('dusk');
    expect(load()).toEqual([]);
  });

  test('ignores deleting a missing one', () => {
    expect(() => del('dusk')).not.toThrow();
  });

  test('returns a file that is not JSON with why', () => {
    fs.mkdirSync(path.join(configLocalDir(), folder), { recursive: true });
    fs.writeFileSync(path.join(configLocalDir(), folder, 'dusk.json'), '{');

    expect(load()).toEqual([{ id: 'dusk', error: expect.stringMatching(/dusk\.json is not JSON/) }]);
  });

  test('throws and writes nothing for a malformed value', () => {
    expect(() => save('dusk', { name: '' })).toThrow();
    expect(fs.existsSync(path.join(configLocalDir(), folder))).toBe(false);
  });

  test.each(['', '..', '../other', 'a/b', 'a\\b', '.hidden', 7, undefined])('throws for the id %j', (id) => {
    expect(() => save(id, content)).toThrow(new RegExp(`invalid ${kind} id`));
    expect(() => del(id)).toThrow(new RegExp(`invalid ${kind} id`));
  });
});

describe('watchUserThemesAndKeymaps', () => {
  const send = vi.fn();
  let stop: (() => void) | undefined;

  // Watches, then waits out the events FSEvents still reports from just before, e.g. the previous test's.
  async function watch() {
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{ webContents: { send } } as unknown as BrowserWindow]);
    stop = watchUserThemesAndKeymaps();
    await new Promise((resolve) => setTimeout(resolve, 300));
    send.mockClear();
  }

  function put(file: string, content = '{}') {
    fs.mkdirSync(path.dirname(path.join(configLocalDir(), file)), { recursive: true });
    fs.writeFileSync(path.join(configLocalDir(), file), content);
  }

  afterEach(() => {
    stop?.();
    send.mockReset();
  });

  test('creates themes and keymaps folders', async () => {
    await watch();

    expect(fs.existsSync(path.join(configLocalDir(), 'themes'))).toBe(true);
    expect(fs.existsSync(path.join(configLocalDir(), 'keymaps'))).toBe(true);
  });

  test('sends themes for written theme', async () => {
    put('themes/dusk.json');
    await watch();

    put('themes/dusk.json', '{ "name": "Dusk" }');

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('settings:changed', 'themes'));
  });

  test('sends keymaps for deleted keymap', async () => {
    put('keymaps/emacs.json');
    await watch();

    fs.rmSync(path.join(configLocalDir(), 'keymaps', 'emacs.json'));

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('settings:changed', 'keymaps'));
  });

  test('sends themes for recreated themes folder', async () => {
    await watch();
    fs.rmSync(path.join(configLocalDir(), 'themes'), { recursive: true });

    put('themes/dusk.json');

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('settings:changed', 'themes'));
  });

  test('skips settings and temporary files', async () => {
    await watch();

    put('settings.json');
    put('themes/dusk.json.tmp');
    put('keymaps/notes.txt');

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(send).not.toHaveBeenCalled();
  });
});

function write(settings: unknown) {
  fs.mkdirSync(configLocalDir(), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(settings));
}
