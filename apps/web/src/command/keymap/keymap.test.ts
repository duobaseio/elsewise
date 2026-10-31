import type { InstalledPlugin, InvalidPlugin } from '@elsewise/bridge';
import { type ApplicationCommand, DEFAULT_COMMAND_GROUPS, Keymap } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import elsewise from '@/command/keymap/bundled/elsewise.json';
import {
  installApplicationKeys,
  type LoadedKeymap,
  resolveKeymap,
  useLoadedKeymaps,
  userKeymapsQuery,
} from '@/command/keymap/keymap';
import { PluginStoreContext } from '@/plugins/plugin-store';
import { builtInCommands } from '../../../test/commands';
import { pluginStore } from '../../../test/plugins';

const ELSEWISE: LoadedKeymap = { id: { source: 'elsewise', id: 'elsewise' }, keymap: Keymap.parse(elsewise) };

const ECLIPSE: LoadedKeymap = {
  id: { source: 'plugin', plugin: 'io.example', id: 'Eclipse' },
  keymap: { name: 'Eclipse', keys: {} },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Returns the plugin `id` with `keymaps`.
function plugin(id: string, keymaps: InstalledPlugin['keymaps'], enabled = true): InstalledPlugin {
  return { manifest: { id, name: id, version: '1.0.0', main: 'main.js' }, enabled, themes: [], keymaps, url: '' };
}

// Returns what `useLoadedKeymaps` returns with `plugins` installed and the user's `keymaps`, leaving out Elsewise's.
async function keymaps(
  plugins: readonly (InstalledPlugin | InvalidPlugin)[],
  user: InstalledPlugin['keymaps'] = [],
): Promise<readonly LoadedKeymap[]> {
  // The store reads the plugins through the bridge, which Node lacks.
  vi.stubGlobal('window', {});
  const store = await pluginStore(plugins);
  const client = new QueryClient();
  client.setQueryData(userKeymapsQuery.queryKey, user);
  let result: readonly LoadedKeymap[] = [];
  function Probe() {
    result = useLoadedKeymaps();
    return null;
  }
  renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PluginStoreContext, { value: store }, createElement(Probe)),
    ),
  );
  return result.filter(({ id }) => id.source !== 'elsewise');
}

// Returns a window with application keys installed for `added`, which are added in order.
function install(...added: ApplicationCommand[]) {
  const window = new EventTarget() as Window;
  const commands = builtInCommands();
  for (const command of added) {
    commands.add([command]);
  }
  const dispose = installApplicationKeys(window, commands);
  return { window, dispose };
}

// Returns a cancelable keydown that presses Ctrl-k, with `init` overriding its properties.
function press(init: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...init,
  }) as KeyboardEvent;
}

// Returns an application command `id` bound to Ctrl-k.
function command(id: string, run: () => boolean, enabled = true): ApplicationCommand {
  return {
    id,
    label: id,
    scope: 'application',
    group: DEFAULT_COMMAND_GROUPS.application.id,
    defaultKeys: ['Ctrl-k'],
    enabled: () => enabled,
    run,
  };
}

describe('resolveKeymap', () => {
  test('finds keymap by id', () => {
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ECLIPSE.id)).toBe(ECLIPSE.keymap);
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ELSEWISE.id)).toBe(ELSEWISE.keymap);
  });

  test('distinguishes plugins with same keymap name', () => {
    const other: LoadedKeymap = {
      id: { source: 'plugin', plugin: 'io.other', id: 'Eclipse' },
      keymap: { name: 'Eclipse', keys: {} },
    };

    expect(resolveKeymap([ECLIPSE, other], other.id)).toBe(other.keymap);
  });

  test('falls back to Elsewise', () => {
    expect(resolveKeymap([ELSEWISE], ECLIPSE.id)).toEqual(ELSEWISE.keymap);
  });
});

describe('installApplicationKeys', () => {
  test('runs matching command', () => {
    const run = vi.fn(() => true);
    const { window } = install(command('a', run));
    window.dispatchEvent(press());
    window.dispatchEvent(press({ key: 'j', keyCode: 74 }));

    expect(run).toHaveBeenCalledOnce();
  });

  test('prevents default', () => {
    const { window } = install(command('a', () => true));
    const handled = press();
    const unbound = press({ key: 'j', keyCode: 74 });
    window.dispatchEvent(handled);
    window.dispatchEvent(unbound);

    expect(handled.defaultPrevented).toBe(true);
    expect(unbound.defaultPrevented).toBe(false);
  });

  test('skips handled key', () => {
    const run = vi.fn(() => true);
    const window = new EventTarget() as Window;
    window.addEventListener('keydown', (event) => event.preventDefault());
    const commands = builtInCommands();
    commands.add([command('a', run)]);
    installApplicationKeys(window, commands);
    window.dispatchEvent(press());

    expect(run).not.toHaveBeenCalled();
  });

  test('skips composition', () => {
    const run = vi.fn(() => true);
    const { window } = install(command('a', run));
    window.dispatchEvent(press({ isComposing: true }));

    expect(run).not.toHaveBeenCalled();
  });

  test('falls through disabled command', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const { window } = install(command('first', first), command('second', second, false));
    const event = press();
    window.dispatchEvent(event);

    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  test('stops on dispose', () => {
    const run = vi.fn(() => true);
    const { window, dispose } = install(command('a', run));
    dispose();
    window.dispatchEvent(press());

    expect(run).not.toHaveBeenCalled();
  });
});

describe('userKeymapsQuery', () => {
  test('returns none without bridge', async () => {
    vi.stubGlobal('window', {});

    await expect(new QueryClient().fetchQuery(userKeymapsQuery)).resolves.toEqual([]);
  });

  test('logs unreadable keymap', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const keymaps = [
      { id: 'mine', keymap: ECLIPSE.keymap },
      { id: 'theirs', error: 'theirs.json is not JSON' },
    ];
    vi.stubGlobal('window', { bridge: { settings: { loadUserKeymaps: async () => keymaps } } });

    await expect(new QueryClient().fetchQuery(userKeymapsQuery)).resolves.toEqual(keymaps);
    expect(error).toHaveBeenCalledExactlyOnceWith('Keymap theirs failed to load: theirs.json is not JSON');
  });
});

describe('useLoadedKeymaps', () => {
  test('appends user and plugin keymaps', async () => {
    expect(
      await keymaps(
        [plugin('io.example', [{ id: 'Eclipse', keymap: ECLIPSE.keymap }])],
        [{ id: 'mine', keymap: ECLIPSE.keymap }],
      ),
    ).toEqual([{ id: { source: 'user', id: 'mine' }, keymap: ECLIPSE.keymap }, ECLIPSE]);
  });

  test('skips disabled plugin', async () => {
    expect(await keymaps([plugin('io.example', [{ id: 'Eclipse', keymap: ECLIPSE.keymap }], false)])).toEqual([]);
  });

  test('skips invalid plugin', async () => {
    expect(await keymaps([{ id: 'io.example', enabled: true, error: 'manifest.json does not exist' }])).toEqual([]);
  });

  test('skips unreadable keymaps', async () => {
    expect(
      await keymaps(
        [plugin('io.example', [{ id: 'Eclipse', error: 'Eclipse.json is not JSON' }])],
        [{ id: 'mine', error: 'mine.json is not JSON' }],
      ),
    ).toEqual([]);
  });
});
