import fs from 'node:fs';
import path from 'node:path';
import { dataLocalDir } from '@elsewise/core';
import { ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { handlePlugins } from './plugins';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
// The real `writeJsonSync`, but in a temporary folder rather than the user's data folder.
vi.mock('@elsewise/core', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const data = mkdtempSync(join(tmpdir(), 'elsewise-'));
  return { ...(await importOriginal<typeof import('@elsewise/core')>()), dataLocalDir: () => data };
});

const ENTRIES_FILE = path.join(dataLocalDir(), 'plugins.json');
const PLUGINS_FOLDER = path.join(dataLocalDir(), 'plugins');
const ENTRY = { id: 'hello', enabled: true };
const MANIFEST = { id: 'hello', name: 'Hello', version: '1.0.0', elsewise: '^1.0.0', frontend: { main: 'main.js' } };
const URL = 'app://elsewise/plugins/hello/bundle/main.js';

const NOTHING = { themes: [], keymaps: [] };
const DUSK = { name: 'Dusk', dark: { interface: { background: '#1c2430' }, editor: {}, terminal: {} } };
const EMACS = { name: 'Emacs', keys: { 'io.example.rename': ['Ctrl-r'] } };

// Each list `validate` rejects, with the error it rejects it with.
const MALFORMED: [string, unknown, RegExp][] = [
  ['is not an array', { plugins: [ENTRY] }, /not an array/],
  ['has a null entry', [ENTRY, null], /entry 1 is malformed/],
  ['has an entry missing a property', [{ id: 'hello' }], /entry 0 is malformed/],
  ['has an entry with a property of the wrong type', [{ ...ENTRY, enabled: 'true' }], /entry 0 is malformed/],
  ['has an entry with an id that is not a path segment', [{ ...ENTRY, id: '../hello' }], /entry 0 is malformed/],
  ['has two entries with the same id', [ENTRY, { ...ENTRY, enabled: false }], /share the id hello/],
];

afterEach(() => {
  fs.rmSync(ENTRIES_FILE, { recursive: true, force: true });
  fs.rmSync(PLUGINS_FOLDER, { recursive: true, force: true });
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(dataLocalDir(), { recursive: true, force: true });
});

// Returns the handler `handlePlugins` registers for `channel`.
function handler(channel: string) {
  handlePlugins();

  return vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1] as unknown as (
    event?: unknown,
    argument?: unknown,
  ) => unknown;
}

// Installs a plugin in `folder` with `manifest`, written as is when a string and as JSON otherwise.
function install(folder: string, manifest: unknown) {
  fs.mkdirSync(path.join(PLUGINS_FOLDER, folder), { recursive: true });
  fs.writeFileSync(
    path.join(PLUGINS_FOLDER, folder, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  );
}

// Writes `content` to `file` in the bundle of the plugin in `folder`, as is when a string and as JSON otherwise.
function bundle(folder: string, file: string, content: unknown) {
  fs.mkdirSync(path.dirname(path.join(PLUGINS_FOLDER, folder, 'bundle', file)), { recursive: true });
  fs.writeFileSync(
    path.join(PLUGINS_FOLDER, folder, 'bundle', file),
    typeof content === 'string' ? content : JSON.stringify(content),
  );
}

describe('plugins:load', () => {
  test('returns no plugins when the plugins folder does not exist', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));

    expect(handler('plugins:load')()).toEqual([]);
  });

  test('returns plugin in each folder by name, enabled as the file says', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY, { id: 'goodbye', enabled: false }]));
    install('hello', MANIFEST);
    install('goodbye', { ...MANIFEST, id: 'goodbye' });

    expect(handler('plugins:load')()).toEqual([
      {
        manifest: { ...MANIFEST, id: 'goodbye' },
        ...NOTHING,
        url: 'app://elsewise/plugins/goodbye/bundle/main.js',
        enabled: false,
      },
      { manifest: MANIFEST, ...NOTHING, url: URL, enabled: true },
    ]);
  });

  test("reads plugin's manifest without unknown properties", () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    install('hello', { ...MANIFEST, extra: 'ignored', frontend: { entry: 'ignored' } });

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: true }]);
  });

  test("resolves url from frontend part's main", () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    install('hello', { ...MANIFEST, frontend: { main: 'dist/index.js' } });

    expect(handler('plugins:load')()).toEqual([
      {
        manifest: { ...MANIFEST, frontend: { main: 'dist/index.js' } },
        ...NOTHING,
        url: 'app://elsewise/plugins/hello/bundle/dist/index.js',
        enabled: true,
      },
    ]);
  });

  test('disables plugin without entry', () => {
    install('hello', MANIFEST);

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: false }]);
  });

  test('ignores entry without folder', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY, { id: 'goodbye', enabled: true }]));
    install('hello', MANIFEST);

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: true }]);
  });

  test('ignores files in plugins folder', () => {
    install('hello', MANIFEST);
    fs.writeFileSync(path.join(PLUGINS_FOLDER, '.DS_Store'), '');

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: false }]);
  });

  test('fails plugin without manifest', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    fs.mkdirSync(path.join(PLUGINS_FOLDER, 'hello'), { recursive: true });

    expect(handler('plugins:load')()).toEqual([
      { ...ENTRY, error: expect.stringMatching(/manifest\.json does not exist/) },
    ]);
  });

  test('fails plugin with unreadable manifest', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    fs.mkdirSync(path.join(PLUGINS_FOLDER, 'hello', 'manifest.json'), { recursive: true });

    expect(handler('plugins:load')()).toEqual([{ ...ENTRY, error: expect.stringMatching(/failed to read .*EISDIR/) }]);
  });

  test.each([
    ['is not JSON', '{', /manifest\.json is not JSON/],
    ['is malformed', { ...MANIFEST, version: '1.0' }, /manifest\.json is malformed/],
    ['declares another id', { ...MANIFEST, id: 'goodbye' }, /declares the id goodbye, not its folder's name/],
  ])('fails plugin whose manifest %s', (_, manifest, error) => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    install('hello', manifest);
    install('other', { ...MANIFEST, id: 'other' });

    expect(handler('plugins:load')()).toEqual([
      { ...ENTRY, error: expect.stringMatching(error) },
      {
        manifest: { ...MANIFEST, id: 'other' },
        ...NOTHING,
        url: 'app://elsewise/plugins/other/bundle/main.js',
        enabled: false,
      },
    ]);
  });

  test('reads themes and keymaps in bundle, sorted by id', () => {
    install('hello', MANIFEST);
    bundle('hello', 'themes/dusk.json', DUSK);
    bundle('hello', 'themes/dawn.json', { ...DUSK, name: 'Dawn' });
    bundle('hello', 'keymaps/emacs.json', EMACS);

    expect(handler('plugins:load')()).toEqual([
      {
        manifest: MANIFEST,
        themes: [
          { id: 'dawn', theme: { ...DUSK, name: 'Dawn' } },
          { id: 'dusk', theme: DUSK },
        ],
        keymaps: [{ id: 'emacs', keymap: EMACS }],
        url: URL,
        enabled: false,
      },
    ]);
  });

  test('ignores anything but JSON files in bundle', () => {
    install('hello', MANIFEST);
    bundle('hello', 'themes/README.md', '# Dusk');
    bundle('hello', 'themes/old.json/dusk.json', DUSK);
    bundle('hello', 'keymaps/.DS_Store', '');

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: false }]);
  });

  test.each([
    ['is not JSON', 'dusk', '{', /dusk\.json is not JSON/],
    ['is malformed', 'dusk', { name: 'Dusk' }, /dusk\.json is malformed/],
    ['has an invalid id', '-dusk', DUSK, /-dusk\.json has an invalid id/],
  ])('fails theme that %s', (_, id, content, error) => {
    install('hello', MANIFEST);
    bundle('hello', `themes/${id}.json`, content);
    bundle('hello', 'themes/other.json', DUSK);

    expect(handler('plugins:load')()).toEqual([
      {
        manifest: MANIFEST,
        themes: [
          { id, error: expect.stringMatching(error) },
          { id: 'other', theme: DUSK },
        ],
        keymaps: [],
        url: URL,
        enabled: false,
      },
    ]);
  });

  test('fails malformed keymap', () => {
    install('hello', MANIFEST);
    bundle('hello', 'keymaps/emacs.json', { keys: {} });

    expect(handler('plugins:load')()).toEqual([
      {
        manifest: MANIFEST,
        themes: [],
        keymaps: [{ id: 'emacs', error: expect.stringMatching(/emacs\.json is malformed/) }],
        url: URL,
        enabled: false,
      },
    ]);
  });

  test('skips themes when folder cannot be read', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    install('hello', MANIFEST);
    bundle('hello', 'themes', '');

    expect(handler('plugins:load')()).toEqual([{ manifest: MANIFEST, ...NOTHING, url: URL, enabled: false }]);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/themes: unreadable, skipping it/), expect.anything());
  });

  test('returns plugin with id only', () => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify([ENTRY]));
    install('hello', MANIFEST);
    install('goodbye', { ...MANIFEST, id: 'goodbye' });

    expect(handler('plugins:load')(undefined, 'hello')).toEqual({
      manifest: MANIFEST,
      ...NOTHING,
      url: URL,
      enabled: true,
    });
  });

  test('returns undefined for id without folder', () => {
    install('hello', MANIFEST);

    expect(handler('plugins:load')(undefined, 'goodbye')).toBeUndefined();
  });

  test('throws for id that is not a path segment', () => {
    install('hello', MANIFEST);

    expect(() => handler('plugins:load')(undefined, '../hello')).toThrow(/not a plugin id/);
  });

  test('throws when the file cannot be read', () => {
    fs.mkdirSync(ENTRIES_FILE);

    expect(() => handler('plugins:load')()).toThrow(/EISDIR/);
  });

  test.each(MALFORMED)('throws when the list %s', (_, plugins, error) => {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify(plugins));
    install('hello', MANIFEST);

    expect(() => handler('plugins:load')()).toThrow(error);
  });
});

describe('plugins:save', () => {
  test('writes the plugins without unknown properties', () => {
    handler('plugins:save')({}, [{ ...ENTRY, extra: 'ignored' }]);

    expect(JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'))).toEqual([ENTRY]);
  });

  test.each(MALFORMED)('throws and leaves the file untouched when the list %s', (_, plugins, error) => {
    const existing = JSON.stringify([ENTRY]);
    fs.writeFileSync(ENTRIES_FILE, existing);

    expect(() => handler('plugins:save')({}, plugins)).toThrow(error);
    expect(fs.readFileSync(ENTRIES_FILE, 'utf8')).toBe(existing);
  });
});
