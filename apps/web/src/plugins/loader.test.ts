import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PluginLoader } from './loader';

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
  export function enable(context) {
    events.push('enable ' + context.id);
    context.subscriptions.push(
      { dispose: () => events.push('dispose first') },
      { dispose: () => events.push('dispose second') },
    );
  }
`);

// Waits for the global `gate` before it finishes enabling.
const SLOW = plugin(`
  export async function enable(context) {
    events.push('enable started');
    await gate;
    context.subscriptions.push({ dispose: () => events.push('dispose') });
    events.push('enable finished');
  }
`);

describe('load', () => {
  test('enables the plugin with its id', async () => {
    await new PluginLoader().load('a', RECORDING);

    expect(events).toEqual(['enable a']);
  });

  test('does nothing for a loaded plugin', async () => {
    const loader = new PluginLoader();
    await loader.load('a', RECORDING);
    await loader.load('a', RECORDING);

    expect(events).toEqual(['enable a']);
  });

  test('reports a module that fails to import, and can be retried', async () => {
    const loader = new PluginLoader();
    await loader.load('a', plugin('this is not javascript'));

    expect(events).toEqual([]);
    expect(error).toHaveBeenCalledOnce();

    await loader.load('a', RECORDING);

    expect(events).toEqual(['enable a']);
  });

  test('reports a module without an enable function', async () => {
    const loader = new PluginLoader();
    await loader.load('a', plugin('export const enable = 1;'));

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain("has no 'enable' function");
  });

  test('disposes the subscriptions of a plugin that throws while enabling', async () => {
    const loader = new PluginLoader();
    await loader.load(
      'a',
      plugin(`
        export function enable(context) {
          context.subscriptions.push({ dispose: () => events.push('dispose') });
          throw new Error('failed');
        }
      `),
    );

    expect(events).toEqual(['dispose']);
    expect(error).toHaveBeenCalledOnce();

    // It isn't loaded, so there is nothing left to dispose.
    await loader.unload('a');

    expect(events).toEqual(['dispose']);
  });

  test('enables an unloaded plugin again', async () => {
    const loader = new PluginLoader();
    await loader.load('a', RECORDING);
    await loader.unload('a');
    await loader.load('a', RECORDING);

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first', 'enable a']);
  });

  test('does not wait for another plugin', async () => {
    vi.stubGlobal('gate', Promise.withResolvers<void>().promise);
    const loader = new PluginLoader();

    void loader.load('a', SLOW);
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    await loader.load('b', RECORDING);

    expect(events).toEqual(['enable started', 'enable b']);
  });
});

describe('unload', () => {
  test('disposes the subscriptions in reverse order', async () => {
    const loader = new PluginLoader();
    await loader.load('a', RECORDING);
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('does nothing for a plugin that is not loaded', async () => {
    const loader = new PluginLoader();
    await loader.unload('a');
    await loader.load('a', RECORDING);
    await loader.unload('a');
    await loader.unload('a');

    expect(events).toEqual(['enable a', 'dispose second', 'dispose first']);
  });

  test('carries on past a disposable that throws', async () => {
    const loader = new PluginLoader();
    await loader.load(
      'a',
      plugin(`
        export function enable(context) {
          context.subscriptions.push(
            { dispose: () => events.push('dispose first') },
            { dispose: () => { throw new Error('failed'); } },
            { dispose: () => events.push('dispose third') },
          );
        }
      `),
    );
    await loader.unload('a');

    expect(events).toEqual(['dispose third', 'dispose first']);
    expect(error).toHaveBeenCalledOnce();
  });

  test('waits for a pending load', async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal('gate', gate.promise);
    const loader = new PluginLoader();

    void loader.load('a', SLOW);
    const unloaded = loader.unload('a');
    await vi.waitFor(() => expect(events).toEqual(['enable started']));
    gate.resolve();
    await unloaded;

    expect(events).toEqual(['enable started', 'enable finished', 'dispose']);
  });
});
