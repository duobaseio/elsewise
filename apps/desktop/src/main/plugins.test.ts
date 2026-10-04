import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { dataLocalDir } from './fs';
import { handlePlugins } from './plugins';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
// The real `writeJsonSync`, but in a temporary folder rather than the user's data folder.
vi.mock('./fs', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const data = mkdtempSync(join(tmpdir(), 'elsewise-'));
  return { ...(await importOriginal<typeof import('./fs')>()), dataLocalDir: () => data };
});

const FILE = path.join(dataLocalDir(), 'plugins.json');
const PLUGIN = { id: 'hello', name: 'Hello', version: '1.0.0', url: 'https://example.com/hello.js', enabled: true };

// Each list `validate` rejects, with the error it rejects it with.
const MALFORMED: [string, unknown, RegExp][] = [
  ['is not an array', { plugins: [PLUGIN] }, /not an array/],
  ['has a null plugin', [PLUGIN, null], /plugin 1 is malformed/],
  ['has a plugin missing a property', [{ ...PLUGIN, url: undefined }], /plugin 0 is malformed/],
  ['has a plugin with a property of the wrong type', [{ ...PLUGIN, enabled: 'true' }], /plugin 0 is malformed/],
  ['has two plugins with the same id', [PLUGIN, { ...PLUGIN, name: 'Other' }], /share the id hello/],
];

afterEach(() => {
  fs.rmSync(FILE, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(dataLocalDir(), { recursive: true, force: true });
});

// Returns the handler `handlePlugins` registers for `channel`.
function handler(channel: string) {
  handlePlugins();

  return vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1] as unknown as (
    event?: unknown,
    plugins?: unknown,
  ) => unknown;
}

describe('plugins:load', () => {
  test('returns no plugins when the file does not exist', () => {
    expect(handler('plugins:load')()).toEqual([]);
  });

  test('returns the plugins in the file without unknown properties', () => {
    fs.writeFileSync(FILE, JSON.stringify([{ ...PLUGIN, extra: 'ignored' }]));

    expect(handler('plugins:load')()).toEqual([PLUGIN]);
  });

  test('throws when the file cannot be read', () => {
    fs.mkdirSync(FILE);

    expect(() => handler('plugins:load')()).toThrow(/EISDIR/);
  });

  test.each(MALFORMED)('throws when the list %s', (_, plugins, error) => {
    fs.writeFileSync(FILE, JSON.stringify(plugins));

    expect(() => handler('plugins:load')()).toThrow(error);
  });
});

describe('plugins:save', () => {
  test('writes the plugins without unknown properties', () => {
    handler('plugins:save')({}, [{ ...PLUGIN, extra: 'ignored' }]);

    expect(JSON.parse(fs.readFileSync(FILE, 'utf8'))).toEqual([PLUGIN]);
  });

  test.each(MALFORMED)('throws and leaves the file untouched when the list %s', (_, plugins, error) => {
    const existing = JSON.stringify([PLUGIN]);
    fs.writeFileSync(FILE, existing);

    expect(() => handler('plugins:save')({}, plugins)).toThrow(error);
    expect(fs.readFileSync(FILE, 'utf8')).toBe(existing);
  });
});
