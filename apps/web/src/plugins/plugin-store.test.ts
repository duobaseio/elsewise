import type { InstalledPlugin } from '@elsewise/bridge';
import { DEFAULT_COMMAND_GROUPS } from '@elsewise/frontend-plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';
import { PluginStore } from '@/plugins/plugin-store';
import { builtInApplication } from '../../test/commands';
import { pluginStore } from '../../test/plugins';

// Returns a store over its own application, and a way to install and enable a plugin in it.
function setUp() {
  const appearance = new AppearanceManager('dark', resolveActiveTheme(undefined, 'dark'));
  const editor = new EditorManager();
  const application = builtInApplication({ appearance, editor });
  const store = new PluginStore();
  // Installs the plugin `id` with its main module at `url`, enables it, and returns its status.
  async function enable(id: string, url: string | undefined) {
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => installed(id, url) } } });
    await store.load(id);
    await store.enable(id, application);
    return store.plugins.find((plugin) => plugin.id === id)?.status;
  }
  return { appearance, editor, commands: application.commands, application, store, enable };
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
    themes: [],
    keymaps: [],
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

  test('adds context menu until disabled', async () => {
    const { editor, store, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable(app) {
              return [app.editor.addContextMenu([{ id: 'a.group', order: 0, items: [] }])];
            },
          };
        }
      `),
    );

    expect(editor.contextMenu).toContainEqual({ id: 'a.group', order: 0, items: [] });

    await store.disable('a');

    expect(editor.contextMenu).not.toContainEqual({ id: 'a.group', order: 0, items: [] });
  });

  test('adds commands', async () => {
    const { commands, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable(app) {
              return [app.commands.add([{ id: 'a.rename', label: 'Rename', scope: 'application', group: 'elsewise.application', run() {} }])];
            },
          };
        }
      `),
    );

    expect(commands.commands.get('a.rename')?.label).toBe('Rename');
  });

  test('runs commands with application', async () => {
    await setUp().enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable(app) {
              app.commands.add([
                {
                  id: 'a.run',
                  label: 'Run',
                  scope: 'application',
                  group: 'elsewise.application',
                  run: (received) => events.push(received === app ? 'run with application' : 'run'),
                },
              ]);
              app.commands.run('a.run');
            },
          };
        }
      `),
    );

    expect(events).toEqual(['run with application']);
  });

  test('calls hooks while enabled', async () => {
    const { appearance, store, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            onBrightnessChange: (brightness) => events.push('brightness ' + brightness),
            onThemeChange: () => events.push('theme'),
          };
        }
      `),
    );
    appearance.brightness = 'light';
    appearance.theme = { ...appearance.theme };
    await store.disable('a');
    appearance.brightness = 'dark';

    expect(events).toEqual(['brightness light', 'theme']);
  });

  test('calls keymap hook while enabled', async () => {
    const { commands, store, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return { onKeymapChange: (keymap) => events.push('keymap ' + keymap.commands.size) };
        }
      `),
    );
    commands.add([
      {
        id: 'a.run',
        label: 'Run',
        scope: 'application',
        group: DEFAULT_COMMAND_GROUPS.application.id,
        run: () => true,
      },
    ]);
    await store.disable('a');
    commands.add([
      {
        id: 'a.other',
        label: 'Other',
        scope: 'application',
        group: DEFAULT_COMMAND_GROUPS.application.id,
        run: () => true,
      },
    ]);

    expect(events).toEqual([`keymap ${commands.keymap.commands.size - 1}`]);
  });

  test('logs throwing hook', async () => {
    const { appearance, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return { onBrightnessChange() { throw new Error('failed'); } };
        }
      `),
    );
    appearance.brightness = 'light';

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('Plugin a');
  });

  test('logs rejecting hook', async () => {
    const { appearance, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return {
            async onBrightnessChange() {
              await Promise.resolve();
              throw new Error('failed');
            },
          };
        }
      `),
    );
    appearance.brightness = 'light';

    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(error.mock.calls[0]?.[0]).toContain('Plugin a');
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
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    await store.disable('a');
    await enable('a', RECORDING);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('re-evaluates module of disabled plugin', async () => {
    const url = plugin(`
      events.push('evaluate');
      export default function () { return {}; }
    `);
    const { store, enable } = setUp();
    await enable('a', url);
    await store.disable('a');
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
    const { application } = setUp();
    vi.stubGlobal('window', { bridge: { version: '2.0.0' } });
    const store = await pluginStore([installed('a', RECORDING)]);
    await store.enable('a', application);

    expect(store.plugins[0]).toEqual({
      id: 'a',
      status: 'incompatible',
      manifest: installed('a', RECORDING).manifest,
      unsatisfied: { elsewise: '^1.0.0' },
    });
    expect(error.mock.calls).toEqual([['Plugin a cannot be enabled: needs Elsewise ^1.0.0']]);
    expect(events).toEqual([]);
  });

  test('enables plugin whose range includes version', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', { bridge: { version: '1.4.0' } });
    const store = await pluginStore([installed('a', RECORDING)]);
    await store.enable('a', application);

    expect(store.plugins[0]?.status).toBe('enabled');
    expect(events).toEqual(['enable a']);
  });

  test('enables plugin without frontend part without importing', async () => {
    const { store, enable } = setUp();
    await expect(enable('a', undefined)).resolves.toBe('enabled');
    await store.disable('a');

    expect(store.plugins[0]?.status).toBe('disabled');
    expect(error).not.toHaveBeenCalled();
  });

  test('skips invalid plugin', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([{ id: 'a', enabled: true, error: 'manifest.json does not exist' }]);
    await store.enable('a', application);

    expect(store.plugins[0]?.status).toBe('invalid');
  });

  test('enables dependencies first', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
    ]);
    await store.enable('a', application);

    expect(events).toEqual(['enable c', 'enable b', 'enable a']);
  });

  test('enables waiting dependents', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { b: '^1.0.0' }), installed('b', TRACKED)]);
    await store.enableAll(application);
    await store.disable('b');

    expect(store.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'incompatible' },
    });

    await store.enable('b', application);

    expect(events).toEqual(['enable b', 'enable a', 'dispose a', 'dispose b', 'enable b', 'enable a']);
    expect(store.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('refuses dependent whose dependency is uninstalled while enabling', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([installed('a', SLOW), dependent('b', { a: '^1.0.0' })]);

    const enabled = store.enable('b', application);
    await vi.waitFor(() => expect(events).toContain('enable started'));
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => undefined } } });
    const unloaded = store.load('a');
    gate.resolve();
    await Promise.all([enabled, unloaded]);

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
    expect(store.plugins).toEqual([
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
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    await store.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('calls onDisable before disposing', async () => {
    const { store, enable } = setUp();
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
    await store.disable('a');

    expect(events).toEqual(['disable', 'dispose']);
  });

  test('disposes past throwing onDisable', async () => {
    const { store, enable } = setUp();
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
    await store.disable('a');

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('ignores disabled plugin', async () => {
    const { store, enable } = setUp();
    await store.disable('a');
    await enable('a', RECORDING);
    await store.disable('a');
    await store.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('awaits async disposable', async () => {
    const { store, enable } = setUp();
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
    await store.disable('a');

    expect(events).toEqual(['dispose second', 'dispose first']);
  });

  test('continues past throwing disposable', async () => {
    const { store, enable } = setUp();
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
    await store.disable('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('skips timed-out disposable', async () => {
    const { store, enable } = setUp();
    await enable(
      'a',
      plugin(`
        export default function () {
          return { onEnable: () => [() => events.push('dispose first'), () => new Promise(() => {})] };
        }
      `),
    );
    vi.useFakeTimers();
    const disabled = store.disable('a');
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
    const { store, enable } = setUp();
    await enable('a', url);
    await store.disable('a');
    await enable('a', url);

    expect(events).toEqual(['enable a', 'enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for pending enable', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { application, store } = setUp();
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => installed('a', SLOW) } } });
    await store.load('a');

    void store.enable('a', application);
    const disabled = store.disable('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await disabled;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });

  test('disables dependents first', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
    ]);
    await store.enableAll(application);
    await store.disable('c');

    expect(events).toEqual(['enable c', 'enable b', 'enable a', 'dispose a', 'dispose b', 'dispose c']);
    expect(store.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'incompatible' },
    });
    expect(store.plugins[1]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'c', cause: 'incompatible' },
    });
    expect(store.plugins[2]?.status).toBe('disabled');
  });
});

describe('enableAll', () => {
  test('enables flagged plugins in id order and logs invalid ones', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([
      installed('b', RECORDING),
      installed('a', RECORDING),
      { ...installed('c', RECORDING), enabled: false },
      { id: 'd', enabled: true, error: 'manifest.json does not exist' },
    ]);
    await store.enableAll(application);

    expect(events).toEqual(['enable a', 'enable b']);
    expect(error.mock.calls).toEqual([['Plugin d failed to load: manifest.json does not exist']]);
  });

  test('enables dependency before dependent', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { b: '^1.0.0' }), installed('b', TRACKED)]);
    await store.enableAll(application);

    expect(events).toEqual(['enable b', 'enable a']);
    expect(store.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('enables chain in dependency order', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { c: '^1.0.0' }),
      installed('c', TRACKED),
      installed('d', TRACKED),
    ]);
    await store.enableAll(application);

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
    const { application } = setUp();
    vi.stubGlobal('window', { bridge: { version: '1.0.0' } });
    const store = await pluginStore([dependent('a', { b: '^1.0.0' }), ...(b === undefined ? [] : [b])]);
    await store.enableAll(application);

    const cause = b === undefined ? 'missing' : 'incompatible';
    expect(store.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { dependency: 'b', cause } });
    expect(error.mock.calls).toContainEqual([`Plugin a cannot be enabled: depends on b, which is ${what}`]);
    expect(events).not.toContain('enable a');
  });

  test('marks dependent of failed dependency incompatible', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { b: '^1.0.0' }), installed('b', FAILING)]);
    await store.enableAll(application);

    expect(store.plugins.map(({ status }) => status)).toEqual(['incompatible', 'failed']);
    expect(store.plugins[0]).toMatchObject({ unsatisfied: { dependency: 'b', cause: 'incompatible' } });
    expect(error.mock.calls).toContainEqual(['Plugin a cannot be enabled: depends on b, which is failed']);
  });

  test('marks transitive dependents incompatible', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { b: '^1.0.0' }), dependent('b', { c: '^1.0.0' })]);
    await store.enableAll(application);

    expect(store.plugins[0]).toMatchObject({ unsatisfied: { dependency: 'b', cause: 'incompatible' } });
    expect(store.plugins[1]).toMatchObject({ unsatisfied: { dependency: 'c', cause: 'missing' } });
    expect(events).toEqual([]);
  });

  test('marks cycle incompatible and enables rest', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([
      dependent('a', { b: '^1.0.0' }),
      dependent('b', { a: '^1.0.0' }),
      dependent('c', { a: '^1.0.0' }),
      installed('d', TRACKED),
    ]);
    await store.enableAll(application);

    expect(store.plugins.map(({ status }) => status)).toEqual([
      'incompatible',
      'incompatible',
      'incompatible',
      'enabled',
    ]);
    expect(store.plugins[0]).toMatchObject({ unsatisfied: { cycle: ['a', 'b'] } });
    expect(store.plugins[1]).toMatchObject({ unsatisfied: { cycle: ['a', 'b'] } });
    expect(store.plugins[2]).toMatchObject({ unsatisfied: { dependency: 'a', cause: 'incompatible' } });
    expect(error.mock.calls).toContainEqual(['Plugin a cannot be enabled: is in a dependency cycle with b']);
    expect(events).toEqual(['enable d']);
  });

  test('marks self-dependency incompatible', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { a: '^1.0.0' })]);
    await store.enableAll(application);

    expect(store.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { cycle: ['a'] } });
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
    const { store, enable } = setUp();
    await enable('a', url);
    await enable('b', url);
    await store.disableAll();

    expect(events).toEqual(['dispose b', 'dispose a']);
    expect(store.plugins.map(({ status }) => status)).toEqual(['disabled', 'disabled']);
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
    const { application, store, enable } = setUp();
    await enable('a', url);
    await enable('b', url);

    void store.disableAll();
    await store.enableAll(application);

    expect(events.toSorted()).toEqual(['dispose a', 'dispose b', 'enable a', 'enable a', 'enable b', 'enable b']);
    expect(store.plugins.map(({ status }) => status)).toEqual(['enabled', 'enabled']);
  });

  test('disables dependents first', async () => {
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const store = await pluginStore([installed('a', TRACKED), dependent('b', { a: '^1.0.0' })]);
    await store.enableAll(application);
    await store.disableAll();

    expect(events).toEqual(['enable a', 'enable b', 'dispose b', 'dispose a']);
    expect(store.plugins.map(({ status }) => status)).toEqual(['disabled', 'disabled']);
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
    const { application } = setUp();
    vi.stubGlobal('window', {});
    const b = { ...dependent('b', { a: '^1.0.0' }), url: slow };
    const store = await pluginStore([installed('a', TRACKED), b]);
    await store.enableAll(application);

    const disabled = store.disableAll();
    await vi.waitFor(() => expect(events).toContain('disposing b'));
    expect(events).not.toContain('dispose a');

    gate.resolve();
    await disabled;

    expect(events).toEqual(['enable a', 'disposing b', 'dispose b', 'dispose a']);
  });
});

describe('loadAll', () => {
  test('marks plugin whose range excludes version incompatible', async () => {
    vi.stubGlobal('window', { bridge: { version: '2.0.0' } });
    const store = await pluginStore([installed('a', RECORDING)]);

    expect(store.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { elsewise: '^1.0.0' } });
  });

  test('marks plugin whose dependency is missing incompatible', async () => {
    vi.stubGlobal('window', {});
    const store = await pluginStore([dependent('a', { b: '^1.0.0' })]);

    expect(store.plugins[0]).toMatchObject({
      status: 'incompatible',
      unsatisfied: { dependency: 'b', cause: 'missing' },
    });
  });

  test('reads none without bridge', async () => {
    vi.stubGlobal('window', {});
    const store = new PluginStore();
    await store.loadAll();

    expect(store.plugins).toEqual([]);
  });

  test('logs unreadable themes and keymaps of enabled plugins', async () => {
    const plugins: InstalledPlugin[] = [
      {
        ...installed('io.example', ''),
        themes: [{ id: 'dusk', error: 'dusk.json is not JSON' }],
        keymaps: [{ id: 'emacs', error: 'emacs.json is malformed' }],
      },
      { ...installed('io.other', ''), enabled: false, themes: [{ id: 'dawn', error: 'dawn.json is not JSON' }] },
    ];
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => plugins } } });
    const store = new PluginStore();
    await store.loadAll();

    expect(error.mock.calls).toEqual([
      ["Plugin io.example's theme dusk failed to load: dusk.json is not JSON"],
      ["Plugin io.example's keymap emacs failed to load: emacs.json is malformed"],
    ]);
  });

  test('offers readable themes and keymaps of enabled plugins only', async () => {
    const dusk = { name: 'Dusk', dark: { interface: {}, editor: {}, terminal: {} } };
    const plugins: InstalledPlugin[] = [
      {
        ...installed('a', ''),
        themes: [
          { id: 'dusk', theme: dusk },
          { id: 'dawn', error: 'dawn.json is not JSON' },
        ],
      },
      { ...installed('b', ''), enabled: false, themes: [{ id: 'dusk', theme: dusk }] },
    ];
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => plugins } } });
    const store = new PluginStore();
    await store.loadAll();

    expect(store.plugins).toEqual([
      {
        id: 'a',
        status: 'enabled',
        manifest: plugins[0]?.manifest,
        themes: [{ id: 'dusk', theme: dusk }],
        keymaps: [],
      },
      { id: 'b', status: 'disabled', manifest: plugins[1]?.manifest },
    ]);
  });

  test('marks invalid plugin', async () => {
    vi.stubGlobal('window', {
      bridge: { plugins: { load: async () => [{ id: 'a', enabled: true, error: 'manifest.json does not exist' }] } },
    });
    const store = new PluginStore();
    await store.loadAll();

    expect(store.plugins[0]?.status).toBe('invalid');
  });

  test('keeps status of failed plugin', async () => {
    const url = plugin('this is not javascript');
    const { store, enable } = setUp();
    await enable('a', url);
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => [installed('a', url)] } } });
    await store.loadAll();

    expect(store.plugins[0]?.status).toBe('failed');
  });

  test('disables uninstalled plugin', async () => {
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => [] } } });
    await store.loadAll();

    expect(store.plugins).toEqual([]);
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });
});

describe('load', () => {
  test('disables and drops uninstalled plugin', async () => {
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => undefined } } });
    await store.load('a');

    expect(store.plugins).toEqual([]);
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('disables plugin that becomes invalid', async () => {
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    vi.stubGlobal('window', {
      bridge: { plugins: { load: async () => ({ id: 'a', enabled: true, error: 'manifest.json is malformed' }) } },
    });
    await store.load('a');

    expect(store.plugins[0]?.status).toBe('invalid');
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('skips enable queued during removal', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { application, store, enable } = setUp();
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
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => undefined } } });

    const removed = store.load('a');
    await vi.waitFor(() => expect(events).toContain('disable started'));
    const enabled = store.enable('a', application);
    gate.resolve();
    await Promise.all([removed, enabled]);

    expect(events).toEqual(['enable', 'disable started']);
  });

  test('places new plugin in id order', async () => {
    vi.stubGlobal('window', {});
    const store = await pluginStore([installed('a', RECORDING), installed('c', RECORDING)]);
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => installed('b', RECORDING) } } });
    await store.load('b');

    expect(store.plugins.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  test('disposes uninstalled dependency after its dependents', async () => {
    const { application, store } = setUp();
    vi.stubGlobal('window', {});
    const plugins = [dependent('a', { b: '^1.0.0' }), dependent('b', { c: '^1.0.0' }), installed('c', TRACKED)];
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => plugins } } });
    await store.loadAll();
    await store.enableAll(application);
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => undefined } } });
    await store.load('c');

    expect(events).toEqual(['enable c', 'enable b', 'enable a', 'dispose a', 'dispose b', 'dispose c']);
    expect(store.plugins.map(({ id, status }) => [id, status])).toEqual([
      ['a', 'incompatible'],
      ['b', 'incompatible'],
    ]);
  });

  test('disables plugin that becomes incompatible', async () => {
    vi.stubGlobal('window', { bridge: { version: '1.0.0' } });
    const { store, enable } = setUp();
    await enable('a', RECORDING);
    const excluded = {
      ...installed('a', RECORDING),
      manifest: { ...installed('a', RECORDING).manifest, elsewise: '^2.0.0' },
    };
    vi.stubGlobal('window', { bridge: { version: '1.0.0', plugins: { load: async () => excluded } } });
    await store.load('a');

    expect(store.plugins[0]).toMatchObject({ status: 'incompatible', unsatisfied: { elsewise: '^2.0.0' } });
    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });
});

describe('subscribe', () => {
  test('notifies of each change', async () => {
    const { store, enable } = setUp();
    const statuses: string[] = [];
    store.subscribe(() => statuses.push(store.plugins[0]?.status ?? 'none'));
    await enable('a', RECORDING);
    await store.disable('a');

    expect(statuses).toEqual(['enabled', 'disabled']);
  });
});
