import { Manifest } from '@elsewise/plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager } from '@/command/command-manager';
import { EditorManager } from '@/editor/editor-manager';
import { PluginLoader } from './loader';

const APPEARANCE = new AppearanceManager(
  'dark',
  resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark'),
);
const EDITOR = new EditorManager();
const APPLICATION = commands(EDITOR).application;
const EMPTY = Manifest.parse({ id: 'a', name: 'A', version: '1.0.0' });

// Returns commands with their own application, for `editor`.
function commands(editor = new EditorManager()): CommandManager {
  return new CommandManager({ appearance: APPEARANCE, editor });
}

// Returns a loader for `commands` and its editor.
function loader(current: CommandManager = commands()): PluginLoader {
  return new PluginLoader(current.application, current.application.editor as EditorManager);
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

const RECORDING = plugin(`
  export function enable(application, context) {
    events.push('enable ' + context.id);
    context.subscriptions.push(
      () => events.push('dispose first'),
      () => events.push('dispose second'),
    );
  }
`);

// Waits for the global `gate` before it finishes enabling.
const SLOW = plugin(`
  export async function enable(application, context) {
    events.push('enable started');
    await gate;
    context.subscriptions.push(() => events.push('dispose'));
    events.push('enable finished');
  }
`);

describe('load', () => {
  test('enables plugin with id', async () => {
    await new PluginLoader(APPLICATION, EDITOR).load('a', RECORDING, EMPTY);

    expect(events).toEqual(['enable a']);
  });

  test("adds manifest's context menu until unloaded", async () => {
    const current = commands();
    const editor = current.application.editor as EditorManager;
    const menu = {
      submenus: {},
      groups: { 'a.group': { order: 0 } },
      items: { 'a.group': [{ type: 'item' as const, order: 0, command: 'a.run' }] },
    };
    const subject = loader(current);
    await subject.load('a', RECORDING, { ...EMPTY, contextMenus: { editor: menu } });

    expect(editor.contextMenu.groups['a.group']).toEqual({ order: 0 });

    await subject.unload('a');

    expect(editor.contextMenu.groups['a.group']).toBeUndefined();
  });

  test('adds commands', async () => {
    const current = commands();
    await loader(current).load(
      'a',
      plugin(`
        export function enable(application, context) {
          context.subscriptions.push(
            application.commands.add([{ id: 'a.rename', label: 'Rename', scope: 'application', run() {} }]),
          );
        }
      `),
      EMPTY,
    );

    expect(current.commands.get('a.rename')?.label).toBe('Rename');
  });

  test('runs commands with application', async () => {
    const current = commands();
    await loader(current).load(
      'a',
      plugin(`
        export async function enable(application) {
          application.commands.add([
            {
              id: 'a.run',
              label: 'Run',
              scope: 'application',
              run: (received) => events.push(received === application ? 'run with application' : 'run'),
            },
          ]);
          application.commands.run('a.run');
        }
      `),
      EMPTY,
    );

    expect(events).toEqual(['run with application']);
  });

  test('ignores loaded plugin', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load('a', RECORDING, EMPTY);
    await loader.load('a', RECORDING, EMPTY);

    expect(events).toEqual(['enable a']);
  });

  test('logs failed import', async () => {
    await new PluginLoader(APPLICATION, EDITOR).load('a', plugin('this is not javascript'), EMPTY);

    expect(events).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  test('reimports module that failed to evaluate', async () => {
    const url = plugin(`
      if (broken) throw new Error('broken');
      export function enable(application, context) {
        events.push('enable ' + context.id);
      }
    `);
    const loader = new PluginLoader(APPLICATION, EDITOR);
    vi.stubGlobal('broken', true);
    await loader.load('a', url, EMPTY);
    vi.stubGlobal('broken', false);
    await loader.load('a', url, EMPTY);

    expect(events).toEqual(['enable a']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('logs module without enable', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load('a', plugin('export const enable = 1;'), EMPTY);

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain("has no 'enable' function");
  });

  test('disposes subscriptions when enable throws', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load(
      'a',
      plugin(`
        export function enable(application, context) {
          context.subscriptions.push(() => events.push('dispose'));
          throw new Error('failed');
        }
      `),
      EMPTY,
    );

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('re-enables unloaded plugin', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load('a', RECORDING, EMPTY);
    await loader.unload('a');
    await loader.load('a', RECORDING, EMPTY);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('re-evaluates module of unloaded plugin', async () => {
    const url = plugin(`
      events.push('evaluate');
      export function enable() {}
    `);
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load('a', url, EMPTY);
    await loader.unload('a');
    await loader.load('a', url, EMPTY);

    expect(events).toEqual(['evaluate', 'evaluate']);
  });

  test('does not wait for another plugin', async () => {
    vi.stubGlobal('gate', Promise.withResolvers<void>().promise);
    const loader = new PluginLoader(APPLICATION, EDITOR);

    void loader.load('a', SLOW, EMPTY);
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    await loader.load('b', RECORDING, EMPTY);

    expect(events).toEqual(['enable started', 'enable b']);
  });
});

describe('unload', () => {
  test('disposes subscriptions in reverse order', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load('a', RECORDING, EMPTY);
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('ignores plugin not loaded', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.unload('a');
    await loader.load('a', RECORDING, EMPTY);
    await loader.unload('a');
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('continues past throwing disposable', async () => {
    const loader = new PluginLoader(APPLICATION, EDITOR);
    await loader.load(
      'a',
      plugin(`
        export function enable(application, context) {
          context.subscriptions.push(
            () => events.push('dispose first'),
            () => { throw new Error('failed'); },
            () => events.push('dispose third'),
          );
        }
      `),
      EMPTY,
    );
    await loader.unload('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for pending load', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const loader = new PluginLoader(APPLICATION, EDITOR);

    void loader.load('a', SLOW, EMPTY);
    const unloaded = loader.unload('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await unloaded;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });
});
