import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import { DEFAULT_COMMAND_GROUPS } from '@elsewise/frontend-plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';
import { PluginStore } from '@/plugins/plugin-store';
import { builtInApplication } from '../../test/commands';

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
  return { appearance, editor, commands: application.commands, store, enable };
}

// Returns the enabled plugin `id` whose main module is at `url`, or whose frontend part is absent when `undefined`.
function installed(id: string, url: string | undefined): InstalledFrontendPlugin {
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
});

// Returns the url of a plugin whose main module is `source`.
function plugin(source: string): string {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

describe('enable', () => {
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
});

describe('loadAll', () => {
  test('reads none without bridge', async () => {
    vi.stubGlobal('window', {});
    const store = new PluginStore();
    await store.loadAll();

    expect(store.plugins).toEqual([]);
  });

  test('logs unreadable themes and keymaps of enabled plugins', async () => {
    const plugins: InstalledFrontendPlugin[] = [
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
    const plugins: InstalledFrontendPlugin[] = [
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
});
