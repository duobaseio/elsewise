import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type DataDirectory, dataDirectory } from '../directories';
import { PluginStore } from './plugin-store';

// A main module that records what happens to it, with `enabled` for an enable, through a module it and the test share.
function tracked(enabled = 'enable'): string {
  return `
import { events } from '../../../recorder.mjs';
export default ({ id }) => ({
  onEnable() {
    events.push(\`${enabled} \${id}\`);
    return [() => events.push(\`dispose \${id}\`)];
  },
  onDisable() {
    events.push(\`disable \${id}\`);
  },
});
`;
}

let data: DataDirectory;
let events: string[];
let store: PluginStore;

beforeEach(async () => {
  data = dataDirectory(await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-plugins-'))));
  const recorder = path.join(data.root, 'recorder.mjs');
  await fs.writeFile(recorder, 'export const events = [];\n');
  ({ events } = await import(pathToFileURL(recorder).href));
  store = new PluginStore(data);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(data.root, { recursive: true, force: true, maxRetries: 10 });
});

// Installs the plugin `id` with a daemon part whose main module is `code`, or without a daemon part when `null`.
async function install(
  id: string,
  {
    code = tracked(),
    dependencies,
    elsewise = '^1.0.0',
    version = '1.0.0',
    enabled = true,
  }: {
    code?: string | null;
    dependencies?: Record<string, string>;
    elsewise?: string;
    version?: string;
    enabled?: boolean;
  } = {},
): Promise<void> {
  const folder = path.join(data.plugins, id);
  await fs.mkdir(folder, { recursive: true });
  const manifest = {
    id,
    name: id,
    version,
    elsewise,
    frontend: {},
    ...(code !== null && { daemon: { ...(dependencies && { dependencies }) } }),
  };
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  if (code !== null) {
    await fs.mkdir(path.join(folder, 'daemon'));
    await fs.writeFile(path.join(folder, 'daemon', 'main.js'), code);
  }
  await flag(id, enabled);
}

// Flags the plugin `id` in `plugins.json`.
async function flag(id: string, enabled: boolean): Promise<void> {
  let entries: unknown[] = [];
  try {
    entries = JSON.parse(await fs.readFile(data.pluginsManifest, 'utf8'));
  } catch {}
  await fs.writeFile(data.pluginsManifest, JSON.stringify([...entries, { id, enabled }]));
}

function status(id: string) {
  return store.plugins.find((plugin) => plugin.id === id)?.status;
}

describe('loadAll', () => {
  test('reads flags', async () => {
    await install('a');
    await install('b', { enabled: false });
    await install('c');
    await fs.rm(data.pluginsManifest);
    await flag('a', true);
    await flag('b', false);

    await store.loadAll();

    expect(store.plugins.map((plugin) => [plugin.id, plugin.status])).toEqual([
      ['a', 'enabled'],
      ['b', 'disabled'],
      ['c', 'disabled'],
    ]);
  });

  test('reports folder without manifest', async () => {
    await fs.mkdir(path.join(data.plugins, 'a'), { recursive: true });

    await store.loadAll();

    expect(store.plugins).toMatchObject([
      { id: 'a', status: 'invalid', error: expect.stringContaining('does not exist') },
    ]);
  });

  test('reports malformed manifest', async () => {
    await install('a');
    await fs.writeFile(path.join(data.plugins, 'a', 'manifest.json'), '{');

    await store.loadAll();

    expect(store.plugins).toMatchObject([
      { id: 'a', status: 'invalid', error: expect.stringContaining('is not JSON') },
    ]);
  });

  test('reports manifest whose id is not its folder', async () => {
    await install('a');
    await fs.rename(path.join(data.plugins, 'a'), path.join(data.plugins, 'b'));

    await store.loadAll();

    expect(store.plugins).toMatchObject([
      { id: 'b', status: 'invalid', error: expect.stringContaining('declares the id a') },
    ]);
  });

  test('ignores files beside plugins', async () => {
    await install('a');
    await fs.writeFile(path.join(data.plugins, '.DS_Store'), '');

    await store.loadAll();

    expect(store.plugins.map((plugin) => plugin.id)).toEqual(['a']);
  });

  test('loads nothing without plugins folder', async () => {
    await store.loadAll();

    expect(store.plugins).toEqual([]);
  });

  test('rejects malformed plugins.json', async () => {
    await fs.writeFile(data.pluginsManifest, '[1]');

    await expect(store.loadAll()).rejects.toThrow();
  });
});

describe('load', () => {
  test('drops uninstalled plugin', async () => {
    await install('a');
    await store.loadAll();
    await fs.rm(path.join(data.plugins, 'a'), { recursive: true });

    await store.load('a');

    expect(store.plugins).toEqual([]);
  });

  test('rejects id that is not a plugin id', async () => {
    await expect(store.load('../a')).rejects.toThrow('not a plugin id');
  });

  test('runs reloaded code', async () => {
    await install('a', { code: tracked('one') });
    await store.loadAll();
    await store.enableAll({});
    await fs.writeFile(path.join(data.plugins, 'a', 'daemon', 'main.js'), tracked('two'));

    await store.disable('a');
    await store.load('a');
    await store.enable('a', {});

    expect(events).toEqual(['one a', 'disable a', 'dispose a', 'two a']);
  });
});

describe('enableAll', () => {
  test('enables dependencies first', async () => {
    await install('b', { dependencies: { a: '^1.0.0' } });
    await install('a');
    await store.loadAll();

    await store.enableAll({});

    expect(events).toEqual(['enable a', 'enable b']);
  });

  test('skips disabled plugin', async () => {
    await install('a', { enabled: false });
    await store.loadAll();

    await store.enableAll({});

    expect(events).toEqual([]);
    expect(status('a')).toBe('disabled');
  });

  test('marks plugin whose range excludes version incompatible', async () => {
    await install('a', { elsewise: '^2.0.0' });
    await store.loadAll();

    await store.enableAll({});

    expect(store.plugins).toMatchObject([{ id: 'a', status: 'incompatible', unsatisfied: { elsewise: '^2.0.0' } }]);
    expect(events).toEqual([]);
  });

  test('marks plugin whose dependency is missing incompatible', async () => {
    await install('b', { dependencies: { a: '^1.0.0' } });
    await store.loadAll();

    await store.enableAll({});

    expect(store.plugins).toMatchObject([
      { id: 'b', status: 'incompatible', unsatisfied: { dependency: 'a', cause: 'missing' } },
    ]);
  });

  test('marks plugin whose dependency is wrong version incompatible', async () => {
    await install('a', { version: '2.0.0' });
    await install('b', { dependencies: { a: '^1.0.0' } });
    await store.loadAll();

    await store.enableAll({});

    expect(status('b')).toBe('incompatible');
    expect(events).toEqual(['enable a']);
  });

  test('marks plugins in cycle incompatible', async () => {
    await install('a', { dependencies: { b: '*' } });
    await install('b', { dependencies: { a: '*' } });
    await store.loadAll();

    await store.enableAll({});

    expect(store.plugins).toMatchObject([
      { id: 'a', status: 'incompatible', unsatisfied: { cycle: ['a', 'b'] } },
      { id: 'b', status: 'incompatible', unsatisfied: { cycle: ['a', 'b'] } },
    ]);
  });

  test('marks plugin without default function failed', async () => {
    await install('a', { code: 'export const x = 1;' });
    await store.loadAll();

    await store.enableAll({});

    expect(status('a')).toBe('failed');
  });

  test('marks plugin that throws failed', async () => {
    await install('a', { code: 'export default () => ({ onEnable() { throw new Error("no"); } });' });
    await store.loadAll();

    await store.enableAll({});

    expect(status('a')).toBe('failed');
  });

  test('marks plugin whose module is missing failed', async () => {
    await install('a');
    await fs.rm(path.join(data.plugins, 'a', 'daemon', 'main.js'));
    await store.loadAll();

    await store.enableAll({});

    expect(status('a')).toBe('failed');
  });

  test('enables plugin without daemon part', async () => {
    await install('a', { code: null });
    await store.loadAll();

    await store.enableAll({});

    expect(status('a')).toBe('enabled');
    expect(events).toEqual([]);
  });
});

describe('disableAll', () => {
  test('disables dependents first', async () => {
    await install('a');
    await install('b', { dependencies: { a: '^1.0.0' } });
    await store.loadAll();
    await store.enableAll({});

    await store.disableAll();

    expect(events).toEqual(['enable a', 'enable b', 'disable b', 'dispose b', 'disable a', 'dispose a']);
    expect(store.plugins.map((plugin) => plugin.status)).toEqual(['disabled', 'disabled']);
  });
});
