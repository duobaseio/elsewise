import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';
import { PluginLoader, pluginsQuery } from '@/plugins/loader';
import { builtInApplication } from '../../test/commands';

// Returns a loader over its own managers.
function setUp() {
  const appearance = new AppearanceManager(
    'dark',
    resolveActiveTheme([], { source: 'elsewise', id: 'elsewise' }, 'dark'),
  );
  const editor = new EditorManager();
  const application = builtInApplication({ appearance, editor });
  return { appearance, editor, commands: application.commands, loader: new PluginLoader(application) };
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
    await expect(setUp().loader.enable('a', RECORDING)).resolves.toBe(true);

    expect(events).toEqual(['enable a']);
  });

  test('adds context menu until disabled', async () => {
    const { editor, loader } = setUp();
    await loader.enable(
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

    await loader.disable('a');

    expect(editor.contextMenu).not.toContainEqual({ id: 'a.group', order: 0, items: [] });
  });

  test('adds commands', async () => {
    const { commands, loader } = setUp();
    await loader.enable(
      'a',
      plugin(`
        export default function () {
          return {
            onEnable(app) {
              return [app.commands.add([{ id: 'a.rename', label: 'Rename', scope: 'application', run() {} }])];
            },
          };
        }
      `),
    );

    expect(commands.commands.get('a.rename')?.label).toBe('Rename');
  });

  test('runs commands with application', async () => {
    await setUp().loader.enable(
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
    const { appearance, loader } = setUp();
    await loader.enable(
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
    await loader.disable('a');
    appearance.brightness = 'dark';

    expect(events).toEqual(['brightness light', 'theme']);
  });

  test('calls keymap hook while enabled', async () => {
    const { commands, loader } = setUp();
    await loader.enable(
      'a',
      plugin(`
        export default function () {
          return { onKeymapChange: (keymap) => events.push('keymap ' + keymap.commands.size) };
        }
      `),
    );
    commands.add([{ id: 'a.run', label: 'Run', scope: 'application', run: () => true }]);
    await loader.disable('a');
    commands.add([{ id: 'a.other', label: 'Other', scope: 'application', run: () => true }]);

    expect(events).toEqual([`keymap ${commands.keymap.commands.size - 1}`]);
  });

  test('logs throwing hook', async () => {
    const { appearance, loader } = setUp();
    await loader.enable(
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
    const { appearance, loader } = setUp();
    await loader.enable(
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
    const { loader } = setUp();
    await loader.enable('a', RECORDING);
    await expect(loader.enable('a', RECORDING)).resolves.toBe(true);

    expect(events).toEqual(['enable a']);
  });

  test('logs failed import', async () => {
    await expect(setUp().loader.enable('a', plugin('this is not javascript'))).resolves.toBe(false);

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
    const { loader } = setUp();
    vi.stubGlobal('broken', true);
    await loader.enable('a', url);
    vi.stubGlobal('broken', false);
    await loader.enable('a', url);

    expect(events).toEqual(['enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('logs module without default function', async () => {
    await expect(setUp().loader.enable('a', plugin('export default 1;'))).resolves.toBe(false);

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('has no default function');
  });

  test('logs throwing default function', async () => {
    await expect(
      setUp().loader.enable('a', plugin("export default function () { throw new Error('failed'); }")),
    ).resolves.toBe(false);

    expect(error).toHaveBeenCalledOnce();
  });

  test('logs throwing onEnable', async () => {
    await expect(
      setUp().loader.enable(
        'a',
        plugin(`
          export default function () {
            return { onEnable() { throw new Error('failed'); } };
          }
        `),
      ),
    ).resolves.toBe(false);

    expect(error).toHaveBeenCalledOnce();
  });

  test('re-enables disabled plugin', async () => {
    const { loader } = setUp();
    await loader.enable('a', RECORDING);
    await loader.disable('a');
    await loader.enable('a', RECORDING);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('re-evaluates module of disabled plugin', async () => {
    const url = plugin(`
      events.push('evaluate');
      export default function () { return {}; }
    `);
    const { loader } = setUp();
    await loader.enable('a', url);
    await loader.disable('a');
    await loader.enable('a', url);

    expect(events).toEqual(['evaluate', 'evaluate']);
  });

  test('enables alongside pending plugin', async () => {
    vi.stubGlobal('gate', Promise.withResolvers<void>().promise);
    const { loader } = setUp();

    void loader.enable('a', SLOW);
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    await loader.enable('b', RECORDING);

    expect(events).toEqual(['enable started', 'enable b']);
  });
});

describe('disable', () => {
  test('disposes in reverse order', async () => {
    const { loader } = setUp();
    await loader.enable('a', RECORDING);
    await loader.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('calls onDisable before disposing', async () => {
    const { loader } = setUp();
    await loader.enable(
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
    await loader.disable('a');

    expect(events).toEqual(['disable', 'dispose']);
  });

  test('disposes past throwing onDisable', async () => {
    const { loader } = setUp();
    await loader.enable(
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
    await loader.disable('a');

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('ignores disabled plugin', async () => {
    const { loader } = setUp();
    await loader.disable('a');
    await loader.enable('a', RECORDING);
    await loader.disable('a');
    await loader.disable('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('awaits async disposable', async () => {
    const { loader } = setUp();
    await loader.enable(
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
    await loader.disable('a');

    expect(events).toEqual(['dispose second', 'dispose first']);
  });

  test('continues past throwing disposable', async () => {
    const { loader } = setUp();
    await loader.enable(
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
    await loader.disable('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('skips timed-out disposable', async () => {
    const { loader } = setUp();
    await loader.enable(
      'a',
      plugin(`
        export default function () {
          return { onEnable: () => [() => events.push('dispose first'), () => new Promise(() => {})] };
        }
      `),
    );
    vi.useFakeTimers();
    const disabled = loader.disable('a');
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
    const { loader } = setUp();
    await loader.enable('a', url);
    await loader.disable('a');
    await loader.enable('a', url);

    expect(events).toEqual(['enable a', 'enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for pending enable', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { loader } = setUp();

    void loader.enable('a', SLOW);
    const disabled = loader.disable('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await disabled;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });
});

describe('pluginsQuery', () => {
  test('returns none without bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().fetchQuery(pluginsQuery)).resolves.toEqual([]);
  });

  test("logs enabled plugin's unreadable themes and keymaps", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manifest = { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' };
    const plugins = [
      {
        manifest,
        enabled: true,
        themes: [{ id: 'dusk', error: 'dusk.json is not JSON' }],
        keymaps: [{ id: 'emacs', error: 'emacs.json is malformed' }],
        url: '',
      },
      {
        manifest: { ...manifest, id: 'io.other' },
        enabled: false,
        themes: [{ id: 'dawn', error: 'dawn.json is not JSON' }],
        keymaps: [],
        url: '',
      },
    ];
    vi.stubGlobal('window', { bridge: { plugins: { load: async () => plugins } } });

    await expect(new QueryClient().fetchQuery(pluginsQuery)).resolves.toEqual(plugins);
    expect(error.mock.calls).toEqual([
      ["Plugin io.example's theme dusk failed to load: dusk.json is not JSON"],
      ["Plugin io.example's keymap emacs failed to load: emacs.json is malformed"],
    ]);
  });
});
