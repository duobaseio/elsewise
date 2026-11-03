import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parsePluginEntries, readPluginsSync } from './plugins.ts';

const ENTRY = { id: 'hello', enabled: true };
const MANIFEST = { id: 'hello', name: 'Hello', version: '1.0.0', elsewise: '^1.0.0', frontend: { main: 'main.js' } };

let root: string;
let folder: string;
let entries: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewise-'));
  folder = path.join(root, 'plugins');
  entries = path.join(root, 'plugins.json');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// Installs a plugin in `name` with `manifest`, written as is when a string and as JSON otherwise.
function install(name: string, manifest: unknown) {
  fs.mkdirSync(path.join(folder, name), { recursive: true });
  fs.writeFileSync(
    path.join(folder, name, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  );
}

describe('readPluginsSync', () => {
  test('reads each folder sorted, enabled as entries say', () => {
    fs.writeFileSync(entries, JSON.stringify([ENTRY, { id: 'goodbye', enabled: false }]));
    install('hello', MANIFEST);
    install('goodbye', { ...MANIFEST, id: 'goodbye' });

    expect(readPluginsSync(folder, entries)).toEqual([
      { manifest: { ...MANIFEST, id: 'goodbye' }, enabled: false },
      { manifest: MANIFEST, enabled: true },
    ]);
  });

  test('disables every plugin without entries', () => {
    install('hello', MANIFEST);

    expect(readPluginsSync(folder, entries)).toEqual([{ manifest: MANIFEST, enabled: false }]);
  });

  test('reads none without folder', () => {
    expect(readPluginsSync(folder, entries)).toEqual([]);
  });

  test('ignores files', () => {
    install('hello', MANIFEST);
    fs.writeFileSync(path.join(folder, '.DS_Store'), '');

    expect(readPluginsSync(folder, entries)).toEqual([{ manifest: MANIFEST, enabled: false }]);
  });

  test('reports missing manifest', () => {
    fs.mkdirSync(path.join(folder, 'hello'), { recursive: true });

    expect(readPluginsSync(folder, entries)).toEqual([
      { id: 'hello', enabled: false, error: expect.stringMatching(/manifest\.json does not exist/) },
    ]);
  });

  test('reports unreadable manifest', () => {
    fs.mkdirSync(path.join(folder, 'hello', 'manifest.json'), { recursive: true });

    expect(readPluginsSync(folder, entries)).toEqual([
      { id: 'hello', enabled: false, error: expect.stringMatching(/failed to read .*EISDIR/) },
    ]);
  });

  test.each([
    ['is not JSON', '{', /manifest\.json is not JSON/],
    ['is malformed', { ...MANIFEST, version: '1.0' }, /manifest\.json is malformed/],
    ['declares another id', { ...MANIFEST, id: 'goodbye' }, /declares the id goodbye, not its folder's name/],
  ])('reports manifest that %s', (_, manifest, error) => {
    install('hello', manifest);

    expect(readPluginsSync(folder, entries)).toEqual([
      { id: 'hello', enabled: false, error: expect.stringMatching(error) },
    ]);
  });

  test('throws for unreadable entries', () => {
    fs.mkdirSync(entries);

    expect(() => readPluginsSync(folder, entries)).toThrow(/EISDIR/);
  });

  test('throws for malformed entries', () => {
    fs.writeFileSync(entries, '[1]');

    expect(() => readPluginsSync(folder, entries)).toThrow(/entry 0 is malformed/);
  });
});

describe('readPluginsSync with id', () => {
  test('reads plugin with id only', () => {
    fs.writeFileSync(entries, JSON.stringify([ENTRY]));
    install('hello', MANIFEST);
    install('goodbye', { ...MANIFEST, id: 'goodbye' });

    expect(readPluginsSync(folder, entries, 'hello')).toEqual({ manifest: MANIFEST, enabled: true });
  });

  test('returns undefined without folder', () => {
    expect(readPluginsSync(folder, entries, 'hello')).toBeUndefined();
  });

  test('throws for id that is not path segment', () => {
    expect(() => readPluginsSync(folder, entries, '../hello')).toThrow(/not a plugin id/);
  });
});

describe('parsePluginEntries', () => {
  test('drops unknown properties', () => {
    expect(parsePluginEntries([{ ...ENTRY, extra: 'ignored' }])).toEqual([ENTRY]);
  });

  test.each([
    ['is not an array', { plugins: [ENTRY] }, /not an array/],
    ['has a null entry', [ENTRY, null], /entry 1 is malformed/],
    ['has an entry missing a property', [{ id: 'hello' }], /entry 0 is malformed/],
    ['has an entry with an id that is not a path segment', [{ ...ENTRY, id: '../hello' }], /entry 0 is malformed/],
    ['has two entries with the same id', [ENTRY, { ...ENTRY, enabled: false }], /share the id hello/],
  ])('throws when list %s', (_, value, error) => {
    expect(() => parsePluginEntries(value)).toThrow(error);
  });
});
