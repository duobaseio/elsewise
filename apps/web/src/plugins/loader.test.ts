import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { PluginLoader } from '@/plugins/loader';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { memoryRouter } from '../../test/commands';

// Returns a loader over its own managers.
function setUp() {
  const appearance = new AppearanceManager(
    'dark',
    resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'),
  );
  const editor = new EditorManager();
  const commands = new CommandManager({
    appearance,
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
    terminal: new TerminalManager(),
  });
  return { appearance, editor, commands, loader: new PluginLoader(appearance, commands) };
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

describe('load', () => {
  test('enables plugin with id', async () => {
    await setUp().loader.load('a', RECORDING);

    expect(events).toEqual(['enable a']);
  });

  test('adds context menu until unloaded', async () => {
    const { editor, loader } = setUp();
    await loader.load(
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

    await loader.unload('a');

    expect(editor.contextMenu).not.toContainEqual({ id: 'a.group', order: 0, items: [] });
  });

  test('adds commands', async () => {
    const { commands, loader } = setUp();
    await loader.load(
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
    await setUp().loader.load(
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
    await loader.load(
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
    await loader.unload('a');
    appearance.brightness = 'dark';

    expect(events).toEqual(['brightness light', 'theme']);
  });

  test('calls keymap hook while enabled', async () => {
    const { commands, loader } = setUp();
    await loader.load(
      'a',
      plugin(`
        export default function () {
          return { onKeymapChange: (keymap) => events.push('keymap ' + keymap.commands.size) };
        }
      `),
    );
    commands.add([{ id: 'a.run', label: 'Run', scope: 'application', run: () => true }]);
    await loader.unload('a');
    commands.add([{ id: 'a.other', label: 'Other', scope: 'application', run: () => true }]);

    expect(events).toEqual([`keymap ${commands.keymap.commands.size - 1}`]);
  });

  test('logs throwing hook', async () => {
    const { appearance, loader } = setUp();
    await loader.load(
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
    await loader.load(
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

  test('ignores loaded plugin', async () => {
    const { loader } = setUp();
    await loader.load('a', RECORDING);
    await loader.load('a', RECORDING);

    expect(events).toEqual(['enable a']);
  });

  test('logs failed import', async () => {
    await setUp().loader.load('a', plugin('this is not javascript'));

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
    await loader.load('a', url);
    vi.stubGlobal('broken', false);
    await loader.load('a', url);

    expect(events).toEqual(['enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('logs module without default function', async () => {
    await setUp().loader.load('a', plugin('export default 1;'));

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('has no default function');
  });

  test('logs throwing default function', async () => {
    await setUp().loader.load('a', plugin("export default function () { throw new Error('failed'); }"));

    expect(error).toHaveBeenCalledOnce();
  });

  test('logs throwing onEnable', async () => {
    await setUp().loader.load(
      'a',
      plugin(`
        export default function () {
          return { onEnable() { throw new Error('failed'); } };
        }
      `),
    );

    expect(error).toHaveBeenCalledOnce();
  });

  test('re-enables unloaded plugin', async () => {
    const { loader } = setUp();
    await loader.load('a', RECORDING);
    await loader.unload('a');
    await loader.load('a', RECORDING);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('re-evaluates module of unloaded plugin', async () => {
    const url = plugin(`
      events.push('evaluate');
      export default function () { return {}; }
    `);
    const { loader } = setUp();
    await loader.load('a', url);
    await loader.unload('a');
    await loader.load('a', url);

    expect(events).toEqual(['evaluate', 'evaluate']);
  });

  test('loads alongside pending plugin', async () => {
    vi.stubGlobal('gate', Promise.withResolvers<void>().promise);
    const { loader } = setUp();

    void loader.load('a', SLOW);
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    await loader.load('b', RECORDING);

    expect(events).toEqual(['enable started', 'enable b']);
  });
});

describe('unload', () => {
  test('disposes in reverse order', async () => {
    const { loader } = setUp();
    await loader.load('a', RECORDING);
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('calls onDisable before disposing', async () => {
    const { loader } = setUp();
    await loader.load(
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
    await loader.unload('a');

    expect(events).toEqual(['disable', 'dispose']);
  });

  test('disposes past throwing onDisable', async () => {
    const { loader } = setUp();
    await loader.load(
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
    await loader.unload('a');

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('ignores unloaded plugin', async () => {
    const { loader } = setUp();
    await loader.unload('a');
    await loader.load('a', RECORDING);
    await loader.unload('a');
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('awaits async disposable', async () => {
    const { loader } = setUp();
    await loader.load(
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
    await loader.unload('a');

    expect(events).toEqual(['dispose second', 'dispose first']);
  });

  test('continues past throwing disposable', async () => {
    const { loader } = setUp();
    await loader.load(
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
    await loader.unload('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('skips timed-out disposable', async () => {
    const { loader } = setUp();
    await loader.load(
      'a',
      plugin(`
        export default function () {
          return { onEnable: () => [() => events.push('dispose first'), () => new Promise(() => {})] };
        }
      `),
    );
    vi.useFakeTimers();
    const unloaded = loader.unload('a');
    await vi.advanceTimersByTimeAsync(15_000);
    await unloaded;

    expect(events).toEqual(['dispose first']);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('Plugin a failed to dispose');
  });

  test('reloads after failed unload', async () => {
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
    await loader.load('a', url);
    await loader.unload('a');
    await loader.load('a', url);

    expect(events).toEqual(['enable a', 'enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for pending load', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const { loader } = setUp();

    void loader.load('a', SLOW);
    const unloaded = loader.unload('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await unloaded;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });
});
