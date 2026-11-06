import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { InstalledPlugin, InvalidPlugin } from './plugin';
import { type EnabledSnapshot, type Lifecycle, PluginResolver } from './plugin-resolver';

// A resolver over the plugins `source` returns, for a host that provides nothing.
class TestResolver extends PluginResolver<InstalledPlugin, object, Lifecycle<object>, EnabledSnapshot> {
  protected readonly part = 'frontend';
  version: string | undefined;
  source: (id?: string) => Promise<(InstalledPlugin | InvalidPlugin)[] | InstalledPlugin | InvalidPlugin | undefined> =
    async () => [];

  protected installed(): Promise<(InstalledPlugin | InvalidPlugin)[]>;
  protected installed(id: string): Promise<InstalledPlugin | InvalidPlugin | undefined>;
  protected installed(id?: string) {
    return this.source(id);
  }

  protected onEnable() {
    return [];
  }

  protected describe(_plugin: InstalledPlugin, snapshot: EnabledSnapshot): EnabledSnapshot {
    return snapshot;
  }
}

// Returns a resolver for a host at `version`, and a way to install and enable a plugin in it.
function setUp(version?: string) {
  const resolver = new TestResolver();
  resolver.version = version;
  // Installs the plugin `id` with its main module at `url`, enables it, and returns its status.
  async function enable(id: string, url: string | undefined) {
    resolver.source = async () => installed(id, url);
    await resolver.load(id);
    await resolver.enable(id, {});
    return resolver.plugins.find((plugin) => plugin.id === id)?.status;
  }
  return { resolver, enable };
}

// Returns a resolver for a host at `version` that has loaded `plugins`.
async function loaded(plugins: readonly (InstalledPlugin | InvalidPlugin)[], version?: string): Promise<TestResolver> {
  const resolver = new TestResolver();
  resolver.version = version;
  resolver.source = async (id) =>
    id === undefined
      ? [...plugins]
      : plugins.find((plugin) => ('error' in plugin ? plugin.id : plugin.manifest.id) === id);
  await resolver.loadAll();
  return resolver;
}

// Returns the enabled plugin `id` whose main module is at `url`, or whose frontend part is absent when `undefined`.
function installed(id: string, url: string | undefined): InstalledPlugin {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      elsewise: '^1.0.0',
      ...(url !== undefined && { frontend: { main: 'main.js' } }),
    },
    enabled: true,
    ...(url !== undefined && { url }),
  };
}

// What the plugins below did, in order. They reach it as the global `events`.
let events: string[];
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  events = [];
  vi.stubGlobal('events', events);
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Returns the url of a plugin whose main module is `source`.
function plugin(source: string): string {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const RECORDING = plugin(`
  export default function ({ id }) {
    return {
      onEnable() {
        events.push('enable ' + id);
        return [() => events.push('dispose first'), () => events.push('dispose second')];
      },
    };
  }
`);

// Waits for the global `gate` before it finishes enabling.
const SLOW = plugin(`
  export default function () {
    return {
      async onEnable() {
        events.push('enable started');
        await gate;
        events.push('enable finished');
        return [() => events.push('dispose')];
      },
    };
  }
`);

describe('enable', () => {
  test('enables plugin with id', async () => {
    await expect(setUp().enable('a', RECORDING)).resolves.toBe('enabled');

    expect(events).toEqual(['enable a']);
  });

  test('ignores enabled plugin', async () => {
    const { enable } = setUp();
    await enable('a', RECORDING);
    await expect(enable('a', RECORDING)).resolves.toBe('enabled');

    expect(events).toEqual(['enable a']);
  });

  test('logs failed import', async () => {
    await expect(setUp().enable('a', plugin('this is not javascript'))).resolves.toBe('failed');

    expect(events).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  test('reimports failed module', async () => {
    const url = plugin(`
      if (broken) throw new Error('broken');
      export default function ({ id }) {
        return {
          onEnable() {
            events.push('enable ' + id);
          },
        };
      }
    `);
    const { enable } = setUp();
    vi.stubGlobal('broken', true);
    await enable('a', url);
    vi.stubGlobal('broken', false);
    await enable('a', url);

    expect(events).toEqual(['enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('logs module without default function', async () => {
    await expect(setUp().enable('a', plugin('export default 1;'))).resolves.toBe('failed');

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('has no default function');
  });

  test('logs throwing default function', async () => {
    await expect(
      setUp().enable('a', plugin("export default function () { throw new Error('failed'); }")),
    ).resolves.toBe('failed');

    expect(error).toHaveBeenCalledOnce();
  });

  test('logs throwing onEnable', async () => {
    await expect(
      setUp().enable(
        'a',
        plugin(`
          export default function () {
            return { onEnable() { throw new Error('failed'); } };
          }
        `),
      ),
    ).resolves.toBe('failed');

    expect(error).toHaveBeenCalledOnce();
  });

  test('re-enables disabled plugin', async () => {
    const { resolver, enable } = setUp();
    await enable('a', RECORDING);
    await resolver.disable('a');
    await enable('a', RECORDING);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('re-evaluates module of disabled plugin', async () => {
    const url = plugin(`
      events.push('evaluate');
      export default function () { return {}; }
    `);
    const { resolver, enable } = setUp();
    await enable('a', url);
    await resolver.disable('a');
    await enable('a', url);

    expect(events).toEqual(['evaluate', 'evaluate']);
  });

  test('enables alongside pending plugin', async () => {
    vi.stubGlobal('gate', Promise.withResolvers<void>().promise);
    const { enable } = setUp();

    void enable('a', SLOW);
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    await enable('b', RECORDING);

    expect(events).toEqual(['enable started', 'enable b']);
  });

  test('skips plugin whose range excludes version', async () => {
    const resolver = await loaded([installed('a', RECORDING)], '2.0.0');
    await resolver.enable('a', {});

    expect(resolver.plugins[0]).toEqual({
      id: 'a',
      status: 'incompatible',
      manifest: installed('a', RECORDING).manifest,
      unsatisfied: { elsewise: '^1.0.0' },
    });
    expect(error.mock.calls).toEqual([['Plugin a cannot be enabled: needs Elsewise ^1.0.0']]);
    expect(events).toEqual([]);
  });

  test('enables plugin whose range includes version', async () => {
    const resolver = await loaded([installed('a', RECORDING)], '1.4.0');
    await resolver.enable('a', {});

    expect(resolver.plugins[0]?.status).toBe('enabled');
    expect(events).toEqual(['enable a']);
  });

  test('enables plugin without part without importing', async () => {
    const { resolver, enable } = setUp();
    await expect(enable('a', undefined)).resolves.toBe('enabled');
    await resolver.disable('a');

    expect(resolver.plugins[0]?.status).toBe('disabled');
    expect(error).not.toHaveBeenCalled();
  });

  test('skips invalid plugin', async () => {
    const resolver = await loaded([{ id: 'a', enabled: true, error: 'manifest.json does not exist' }]);
    await resolver.enable('a', {});

    expect(resolver.plugins[0]?.status).toBe('invalid');
  });

  test('enables dependencies first', async () => {
    const resolver = await loaded([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
    ]);
    await resolver.enable('a', {});

    expect(events).toEqual(['enable c', 'enable b', 'enable a']);
  });

  test('enables waiting dependents', async () => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' }), installed('b', TRACKED)]);
    await resolver.enableAll({});
    await resolver.disable('b');

    expect(resolver.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'incompatible' },
    });

    await resolver.enable('b', {});

    expect(events).toEqual(['enable b', 'enable a', 'dispose a', 'dispose b', 'enable b', 'enable a']);
    expect(resolver.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('refuses dependent whose dependency is uninstalled while enabling', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const resolver = await loaded([installed('a', SLOW), dependent('b', { a: '^1.0.0' })]);

    const enabled = resolver.enable('b', {});
    await vi.waitFor(() => expect(events).toContain('enable started'));
    resolver.source = async () => undefined;
    const unloaded = resolver.load('a');
    gate.resolve();
    await Promise.all([enabled, unloaded]);

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
    expect(resolver.plugins).toEqual([
      expect.objectContaining({ id: 'b', status: 'incompatible', unsatisfied: { dependency: 'a', cause: 'missing' } }),
    ]);
  });
});

// Records enabling and disposing by id.
const TRACKED = plugin(`
  export default function ({ id }) {
    return {
      onEnable() {
        events.push('enable ' + id);
        return [() => events.push('dispose ' + id)];
      },
    };
  }
`);

const FAILING = plugin(`
  export default function () {
    return {
      onEnable() {
        throw new Error('boom');
      },
    };
  }
`);

// Returns the enabled plugin `id`, tracked, whose frontend part depends on `dependencies`, at `version`.
function dependent(id: string, dependencies: Record<string, string>, version = '1.0.0'): InstalledPlugin {
  const plugin = installed(id, TRACKED);
  return { ...plugin, manifest: { ...plugin.manifest, version, frontend: { main: 'main.js', dependencies } } };
}

describe('disable', () => {
  test('disposes in reverse order', async () => {
    const { resolver, enable } = setUp();
    await enable('a', RECORDING);
    await resolver.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('calls onDisable before disposing', async () => {
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable: () => [() => events.push('dispose')],
            async onDisable() {
              await Promise.resolve();
              events.push('disable');
            },
          };
        }
      `),
    );
    await resolver.disable('a');

    expect(events).toEqual(['disable', 'dispose']);
  });

  test('disposes past throwing onDisable', async () => {
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable: () => [() => events.push('dispose')],
            onDisable() { throw new Error('failed'); },
          };
        }
      `),
    );
    await resolver.disable('a');

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('ignores disabled plugin', async () => {
    const { resolver, enable } = setUp();
    await resolver.disable('a');
    await enable('a', RECORDING);
    await resolver.disable('a');
    await resolver.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('awaits async disposable', async () => {
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable: () => [
              () => events.push('dispose first'),
              async () => {
                await Promise.resolve();
                events.push('dispose second');
              },
            ],
          };
        }
      `),
    );
    await resolver.disable('a');

    expect(events).toEqual(['dispose second', 'dispose first']);
  });

  test('continues past throwing disposable', async () => {
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable: () => [
              () => events.push('dispose first'),
              () => { throw new Error('failed'); },
              () => events.push('dispose third'),
            ],
          };
        }
      `),
    );
    await resolver.disable('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('skips timed-out disposable', async () => {
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return { onEnable: () => [() => events.push('dispose first'), () => new Promise(() => {})] };
        }
      `),
    );
    vi.useFakeTimers();
    const disabled = resolver.disable('a');
    await vi.advanceTimersByTimeAsync(15_000);
    await disabled;

    expect(events).toEqual(['dispose first']);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('Plugin a failed to dispose');
  });

  test('re-enables after failed disable', async () => {
    const url = plugin(`
      export default function ({ id }) {
        return {
          onEnable() {
            events.push('enable ' + id);
          },
          get onDisable() {
            throw new Error('failed');
          },
        };
      }
    `);
    const { resolver, enable } = setUp();
    await enable('a', url);
    await resolver.disable('a');
    await enable('a', url);

    expect(events).toEqual(['enable a', 'enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for pending enable', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { resolver } = setUp();
    resolver.source = async () => installed('a', SLOW);
    await resolver.load('a');

    void resolver.enable('a', {});
    const disabled = resolver.disable('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await disabled;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });

  test('disables dependents first', async () => {
    const resolver = await loaded([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
    ]);
    await resolver.enableAll({});
    await resolver.disable('c');

    expect(events).toEqual(['enable c', 'enable b', 'enable a', 'dispose a', 'dispose b', 'dispose c']);
    expect(resolver.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'incompatible' },
    });
    expect(resolver.plugins[1]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'c', cause: 'incompatible' },
    });
    expect(resolver.plugins[2]?.status).toBe('disabled');
  });
});

describe('enableAll', () => {
  test('enables flagged plugins in id order and logs invalid ones', async () => {
    const resolver = await loaded([
      installed('b', RECORDING),
      installed('a', RECORDING),
      { ...installed('c', RECORDING), enabled: false },
      { id: 'd', enabled: true, error: 'manifest.json does not exist' },
    ]);
    await resolver.enableAll({});

    expect(events).toEqual(['enable a', 'enable b']);
    expect(error.mock.calls).toEqual([['Plugin d failed to load: manifest.json does not exist']]);
  });

  test('enables dependency before dependent', async () => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' }), installed('b', TRACKED)]);
    await resolver.enableAll({});

    expect(events).toEqual(['enable b', 'enable a']);
    expect(resolver.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('enables chain in dependency order', async () => {
    const resolver = await loaded([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
      installed('d', TRACKED),
    ]);
    await resolver.enableAll({});

    expect(events).toEqual(['enable c', 'enable b', 'enable a', 'enable d']);
  });

  test.each([
    ['missing', undefined, 'not installed'],
    ['invalid', { id: 'b', enabled: true, error: 'manifest.json does not exist' }, 'invalid'],
    [
      'incompatible',
      { ...installed('b', TRACKED), manifest: { ...installed('b', TRACKED).manifest, elsewise: '^2.0.0' } },
      'incompatible',
    ],
    ['disabled', { ...installed('b', TRACKED), enabled: false }, 'disabled'],
    [
      'version',
      { ...installed('b', TRACKED), manifest: { ...installed('b', TRACKED).manifest, version: '2.0.0' } },
      'not within ^1.0.0',
    ],
  ])('marks dependent of %s dependency incompatible', async (_, b, what) => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' }), ...(b === undefined ? [] : [b])], '1.0.0');
    await resolver.enableAll({});

    const cause = b === undefined ? 'missing' : 'incompatible';
    expect(resolver.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { dependency: 'b', cause } });
    expect(error.mock.calls).toContainEqual([`Plugin a cannot be enabled: depends on b, which is ${what}`]);
    expect(events).not.toContain('enable a');
  });

  test('marks dependent of failed dependency incompatible', async () => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' }), installed('b', FAILING)]);
    await resolver.enableAll({});

    expect(resolver.plugins.map(({ status }) => status)).toEqual(['incompatible', 'failed']);
    expect(resolver.plugins[0]).toMatchObject({ unsatisfied: { dependency: 'b', cause: 'incompatible' } });
    expect(error.mock.calls).toContainEqual(['Plugin a cannot be enabled: depends on b, which is failed']);
  });

  test('marks transitive dependents incompatible', async () => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' }), dependent('b', { c: '^1.0.0' })]);
    await resolver.enableAll({});

    expect(resolver.plugins[0]).toMatchObject({ unsatisfied: { dependency: 'b', cause: 'incompatible' } });
    expect(resolver.plugins[1]).toMatchObject({ unsatisfied: { dependency: 'c', cause: 'missing' } });
    expect(events).toEqual([]);
  });

  test('marks cycle incompatible and enables rest', async () => {
    const resolver = await loaded([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { a: '^1.0.0' }),
      dependent('c', { a: '^1.0.0' }),
      installed('d', TRACKED),
    ]);
    await resolver.enableAll({});

    expect(resolver.plugins.map(({ status }) => status)).toEqual([
      'incompatible',
      'incompatible',
      'incompatible',
      'enabled',
    ]);
    expect(resolver.plugins[0]).toMatchObject({ unsatisfied: { cycle: ['a', 'b'] } });
    expect(resolver.plugins[1]).toMatchObject({ unsatisfied: { cycle: ['a', 'b'] } });
    expect(resolver.plugins[2]).toMatchObject({ unsatisfied: { dependency: 'a', cause: 'incompatible' } });
    expect(error.mock.calls).toContainEqual(['Plugin a cannot be enabled: is in a dependency cycle with b']);
    expect(events).toEqual(['enable d']);
  });

  test('marks self-dependency incompatible', async () => {
    const resolver = await loaded([dependent('a', { a: '^1.0.0' })]);
    await resolver.enableAll({});

    expect(resolver.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { cycle: ['a'] } });
    expect(error.mock.calls).toContainEqual(['Plugin a cannot be enabled: depends on itself']);
  });
});

describe('disableAll', () => {
  test('disables every plugin in reverse id order', async () => {
    const url = plugin(`
      export default function ({ id }) {
        return { onEnable: () => [() => events.push('dispose ' + id)] };
      }
    `);
    const { resolver, enable } = setUp();
    await enable('a', url);
    await enable('b', url);
    await resolver.disableAll();

    expect(events).toEqual(['dispose b', 'dispose a']);
    expect(resolver.plugins.map(({ status }) => status)).toEqual(['disabled', 'disabled']);
  });

  test('re-enables plugins enabled right after', async () => {
    const url = plugin(`
      export default function ({ id }) {
        return {
          onEnable() {
            events.push('enable ' + id);
            return [() => events.push('dispose ' + id)];
          },
        };
      }
    `);
    const { resolver, enable } = setUp();
    await enable('a', url);
    await enable('b', url);

    void resolver.disableAll();
    await resolver.enableAll({});

    expect(events.toSorted()).toEqual(['dispose a', 'dispose b', 'enable a', 'enable a', 'enable b', 'enable b']);
    expect(resolver.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('disables dependents first', async () => {
    const resolver = await loaded([installed('a', TRACKED), dependent('b', { a: '^1.0.0' })]);
    await resolver.enableAll({});
    await resolver.disableAll();

    expect(events).toEqual(['enable a', 'enable b', 'dispose b', 'dispose a']);
    expect(resolver.plugins.map(({ status }) => status)).toEqual(['disabled', 'disabled']);
  });

  test('waits for dependent to dispose before dependency', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    // Disposes only once the global `gate` resolves.
    const slow = plugin(`
      export default function ({ id }) {
        return {
          onEnable: () => [async () => { events.push('disposing ' + id); await gate; events.push('dispose ' + id); }],
        };
      }
    `);
    const b = { ...dependent('b', { a: '^1.0.0' }), url: slow };
    const resolver = await loaded([installed('a', TRACKED), b]);
    await resolver.enableAll({});

    const disabled = resolver.disableAll();
    await vi.waitFor(() => expect(events).toContain('disposing b'));
    expect(events).not.toContain('dispose a');

    gate.resolve();
    await disabled;

    expect(events).toEqual(['enable a', 'disposing b', 'dispose b', 'dispose a']);
  });
});

describe('loadAll', () => {
  test('marks plugin whose range excludes version incompatible', async () => {
    const resolver = await loaded([installed('a', RECORDING)], '2.0.0');

    expect(resolver.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { elsewise: '^1.0.0' } });
  });

  test('marks plugin whose dependency is missing incompatible', async () => {
    const resolver = await loaded([dependent('a', { b: '^1.0.0' })]);

    expect(resolver.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'missing' },
    });
  });

  test('marks invalid plugin', async () => {
    const resolver = await loaded([{ id: 'a', enabled: true, error: 'manifest.json does not exist' }]);

    expect(resolver.plugins[0]?.status).toBe('invalid');
  });

  test('keeps status of failed plugin', async () => {
    const url = plugin('this is not javascript');
    const { resolver, enable } = setUp();
    await enable('a', url);
    resolver.source = async () => [installed('a', url)];
    await resolver.loadAll();

    expect(resolver.plugins[0]?.status).toBe('failed');
  });

  test('disables uninstalled plugin', async () => {
    const { resolver, enable } = setUp();
    await enable('a', RECORDING);
    resolver.source = async () => [];
    await resolver.loadAll();

    expect(resolver.plugins).toEqual([]);
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });
});

describe('load', () => {
  test('disables and drops uninstalled plugin', async () => {
    const { resolver, enable } = setUp();
    await enable('a', RECORDING);
    resolver.source = async () => undefined;
    await resolver.load('a');

    expect(resolver.plugins).toEqual([]);
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('disables plugin that becomes invalid', async () => {
    const { resolver, enable } = setUp();
    await enable('a', RECORDING);
    resolver.source = async () => ({ id: 'a', enabled: true, error: 'manifest.json is malformed' });
    await resolver.load('a');

    expect(resolver.plugins[0]?.status).toBe('invalid');
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('skips enable queued during removal', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { resolver, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable: () => events.push('enable'),
            async onDisable() {
              events.push('disable started');
              await gate;
            },
          };
        }
      `),
    );
    resolver.source = async () => undefined;

    const removed = resolver.load('a');
    await vi.waitFor(() => expect(events).toContain('disable started'));
    const enabled = resolver.enable('a', {});
    gate.resolve();
    await Promise.all([removed, enabled]);

    expect(events).toEqual(['enable', 'disable started']);
  });

  test('places new plugin in id order', async () => {
    const resolver = await loaded([installed('a', RECORDING), installed('c', RECORDING)]);
    resolver.source = async () => installed('b', RECORDING);
    await resolver.load('b');

    expect(resolver.plugins.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  test('disposes uninstalled dependency after its dependents', async () => {
    const { resolver } = setUp();
    const plugins = [dependent('a', { b: '^1.0.0' }), dependent('b', { c: '^1.0.0' }), installed('c', TRACKED)];
    resolver.source = async () => plugins;
    await resolver.loadAll();
    await resolver.enableAll({});
    resolver.source = async () => undefined;
    await resolver.load('c');

    expect(events).toEqual(['enable c', 'enable b', 'enable a', 'dispose a', 'dispose b', 'dispose c']);
    expect(resolver.plugins.map(({ id, status }) => [id, status])).toEqual([
      ['a', 'incompatible'],
      ['b', 'incompatible'],
    ]);
  });

  test('disables plugin that becomes incompatible', async () => {
    const { resolver, enable } = setUp('1.0.0');
    await enable('a', RECORDING);
    const excluded = {
      ...installed('a', RECORDING),
      manifest: { ...installed('a', RECORDING).manifest, elsewise: '^2.0.0' },
    };
    resolver.source = async () => excluded;
    await resolver.load('a');

    expect(resolver.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { elsewise: '^2.0.0' } });
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });
});

describe('subscribe', () => {
  test('notifies of each change', async () => {
    const { resolver, enable } = setUp();
    const statuses: string[] = [];
    resolver.subscribe(() => statuses.push(resolver.plugins[0]?.status ?? 'none'));
    await enable('a', RECORDING);
    await resolver.disable('a');

    expect(statuses).toEqual(['enabled', 'disabled']);
  });
});
