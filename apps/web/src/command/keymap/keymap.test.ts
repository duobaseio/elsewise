import { DEFAULT_SETTINGS, type InstalledPlugin, type InvalidPlugin, type KeymapId } from '@elsewise/bridge';
import { type ApplicationCommand, DEFAULT_COMMAND_GROUPS, Keymap } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import elsewise from '@/command/keymap/bundled/elsewise.json';
import {
  installApplicationKeys,
  type LoadedKeymap,
  resolveKeymap,
  useCopyKeymap,
  useDeleteKeymap,
  useLoadedKeymaps,
  useRenameKeymap,
  userKeymapsQuery,
  useUpdateKeymap,
} from '@/command/keymap/keymap';
import { PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';
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

// Returns what `use` returns with `selected` selected, `plugins` installed and the user's `keymaps`, and the client and
// bridge it updates.
async function probe<T>(
  use: () => T,
  selected: KeymapId,
  plugins: readonly (InstalledPlugin | InvalidPlugin)[],
  user: InstalledPlugin['keymaps'] = [],
) {
  const bridge = {
    loadUserKeymaps: vi.fn(async () => user),
    saveUserKeymap: vi.fn(async () => {}),
    deleteUserKeymap: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  };
  vi.stubGlobal('window', { bridge: { settings: bridge } });
  const store = await pluginStore(plugins);
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, { ...DEFAULT_SETTINGS, keymap: selected });
  client.setQueryData(userKeymapsQuery.queryKey, user);
  let result: T | undefined;
  function Probe() {
    result = use();
    return null;
  }
  renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PluginStoreContext, { value: store }, createElement(Probe)),
    ),
  );
  return { result: result as T, client, bridge };
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
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ECLIPSE.id)).toBe(ECLIPSE);
    expect(resolveKeymap([ELSEWISE, ECLIPSE], ELSEWISE.id)).toBe(ELSEWISE);
  });

  test('distinguishes plugins with same keymap name', () => {
    const other: LoadedKeymap = {
      id: { source: 'plugin', plugin: 'io.other', id: 'Eclipse' },
      keymap: { name: 'Eclipse', keys: {} },
    };

    expect(resolveKeymap([ECLIPSE, other], other.id)).toBe(other);
  });

  test('falls back to Elsewise', () => {
    expect(resolveKeymap([ELSEWISE], ECLIPSE.id)).toEqual(ELSEWISE);
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

describe('useUpdateKeymap', () => {
  const KEYS = { 'io.example.rename': ['Ctrl-k'] };

  test('saves into user keymap', async () => {
    const unreadable = { id: 'theirs', error: 'theirs.json is not JSON' };
    const {
      result: { update },
      client,
      bridge,
    } = await probe(
      useUpdateKeymap,
      { source: 'user', id: 'mine' },
      [],
      [{ id: 'mine', keymap: ECLIPSE.keymap }, unreadable],
    );
    update((keys) => ({ ...keys, ...KEYS }));

    const keymap = { name: 'Eclipse', keys: KEYS };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([{ id: 'mine', keymap }, unreadable]);
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('mine', keymap));
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual({ source: 'user', id: 'mine' });
    expect(bridge.save).not.toHaveBeenCalled();
  });

  test('copies then selects', async () => {
    const {
      result: { update },
      client,
      bridge,
    } = await probe(useUpdateKeymap, ECLIPSE.id, [plugin('io.example', [{ id: 'Eclipse', keymap: ECLIPSE.keymap }])]);
    update((keys) => ({ ...keys, ...KEYS }));

    const keymap = { name: 'Eclipse copy', keys: KEYS };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([{ id: 'eclipse-copy', keymap }]);
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual({ source: 'user', id: 'eclipse-copy' });
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('eclipse-copy', keymap));
  });

  test('keeps edit over refetch in flight', async () => {
    const mine = { id: 'mine', keymap: ECLIPSE.keymap };
    const {
      result: { update },
      client,
      bridge,
    } = await probe(useUpdateKeymap, { source: 'user', id: 'mine' }, [], [mine]);
    let load = () => {};
    bridge.loadUserKeymaps.mockReturnValueOnce(new Promise((resolve) => (load = () => resolve([mine]))));
    const refetch = client.refetchQueries(userKeymapsQuery);

    update((keys) => ({ ...keys, ...KEYS }));
    load();
    await refetch;

    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([
      { id: 'mine', keymap: { name: 'Eclipse', keys: KEYS } },
    ]);
  });

  test('undoes last edit', async () => {
    const {
      result: { update, undo },
      bridge,
    } = await probe(useUpdateKeymap, { source: 'user', id: 'mine' }, [], [{ id: 'mine', keymap: ECLIPSE.keymap }]);
    update((keys) => ({ ...keys, ...KEYS }));
    undo();

    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledTimes(2));
    expect(bridge.saveUserKeymap).toHaveBeenNthCalledWith(2, 'mine', ECLIPSE.keymap);
  });

  test('redoes undone edit', async () => {
    const {
      result: { update, undo, redo },
      bridge,
    } = await probe(useUpdateKeymap, { source: 'user', id: 'mine' }, [], [{ id: 'mine', keymap: ECLIPSE.keymap }]);
    update((keys) => ({ ...keys, ...KEYS }));
    undo();
    redo();

    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledTimes(3));
    expect(bridge.saveUserKeymap).toHaveBeenNthCalledWith(3, 'mine', { name: 'Eclipse', keys: KEYS });
  });

  test('drops redo after new edit', async () => {
    const other = { 'io.example.find': ['Ctrl-f'] };
    const {
      result: { update, undo, redo },
      client,
    } = await probe(useUpdateKeymap, { source: 'user', id: 'mine' }, [], [{ id: 'mine', keymap: ECLIPSE.keymap }]);
    update((keys) => ({ ...keys, ...KEYS }));
    undo();
    update((keys) => ({ ...keys, ...other }));
    redo();

    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([
      { id: 'mine', keymap: { name: 'Eclipse', keys: other } },
    ]);
  });

  test('clears history on keymap change', async () => {
    const {
      result: { update, undo },
      client,
      bridge,
    } = await probe(
      useUpdateKeymap,
      { source: 'user', id: 'mine' },
      [],
      [
        { id: 'mine', keymap: ECLIPSE.keymap },
        { id: 'other', keymap: ECLIPSE.keymap },
      ],
    );
    update((keys) => ({ ...keys, ...KEYS }));
    client.setQueryData(settingsQuery.queryKey, { ...DEFAULT_SETTINGS, keymap: { source: 'user', id: 'other' } });
    undo();

    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([
      { id: 'mine', keymap: { name: 'Eclipse', keys: KEYS } },
      { id: 'other', keymap: ECLIPSE.keymap },
    ]);
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledOnce());
  });

  test('undoes into copy after copy on change', async () => {
    const {
      result: { update, undo },
      client,
      bridge,
    } = await probe(useUpdateKeymap, ECLIPSE.id, [plugin('io.example', [{ id: 'Eclipse', keymap: ECLIPSE.keymap }])]);
    update((keys) => ({ ...keys, ...KEYS }));
    undo();

    const keymap = { name: 'Eclipse copy', keys: {} };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([{ id: 'eclipse-copy', keymap }]);
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledTimes(2));
    expect(bridge.saveUserKeymap).toHaveBeenNthCalledWith(2, 'eclipse-copy', keymap);
  });
});

describe('useCopyKeymap', () => {
  test('copies bundled keymap and selects copy', async () => {
    const { result: copy, client, bridge } = await probe(useCopyKeymap, ELSEWISE.id, []);

    expect(copy(ELSEWISE.keymap)).toBe('elsewise-copy');
    const keymap = { name: 'Elsewise copy', keys: ELSEWISE.keymap.keys };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([{ id: 'elsewise-copy', keymap }]);
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual({ source: 'user', id: 'elsewise-copy' });
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('elsewise-copy', keymap));
    await vi.waitFor(() =>
      expect(bridge.save).toHaveBeenCalledExactlyOnceWith({
        ...DEFAULT_SETTINGS,
        keymap: { source: 'user', id: 'elsewise-copy' },
      }),
    );
  });

  test('copies plugin keymap', async () => {
    const {
      result: copy,
      client,
      bridge,
    } = await probe(useCopyKeymap, ECLIPSE.id, [plugin('io.example', [{ id: 'Eclipse', keymap: ECLIPSE.keymap }])]);

    expect(copy(ECLIPSE.keymap)).toBe('eclipse-copy');
    const keymap = { name: 'Eclipse copy', keys: {} };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([{ id: 'eclipse-copy', keymap }]);
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual({ source: 'user', id: 'eclipse-copy' });
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('eclipse-copy', keymap));
  });

  test('numbers taken copy', async () => {
    const taken = { id: 'elsewise-copy', error: 'elsewise-copy.json is not JSON' };
    const { result: copy, client, bridge } = await probe(useCopyKeymap, ELSEWISE.id, [], [taken]);

    expect(copy(ELSEWISE.keymap)).toBe('elsewise-copy-2');
    const keymap = { name: 'Elsewise copy 2', keys: ELSEWISE.keymap.keys };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([taken, { id: 'elsewise-copy-2', keymap }]);
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual({ source: 'user', id: 'elsewise-copy-2' });
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('elsewise-copy-2', keymap));
  });

  test('starts id with letter or digit', async () => {
    const { result: copy } = await probe(useCopyKeymap, ELSEWISE.id, []);

    expect(copy({ ...ELSEWISE.keymap, name: '._Vim' })).toBe('vim-copy');
    expect(copy({ ...ELSEWISE.keymap, name: '日本語' })).toBe('copy');
  });
});

describe('useRenameKeymap', () => {
  test('renames user keymap in place', async () => {
    const other = { id: 'other', keymap: ECLIPSE.keymap };
    const {
      result: rename,
      client,
      bridge,
    } = await probe(
      useRenameKeymap,
      { source: 'user', id: 'mine' },
      [],
      [{ id: 'mine', keymap: ECLIPSE.keymap }, other],
    );
    rename('mine', 'Renamed');

    const renamed = { id: 'mine', keymap: { name: 'Renamed', keys: ECLIPSE.keymap.keys } };
    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([renamed, other]);
    await vi.waitFor(() => expect(bridge.saveUserKeymap).toHaveBeenCalledExactlyOnceWith('mine', renamed.keymap));
  });

  test('ignores unknown keymap', async () => {
    const { result: rename, client, bridge } = await probe(useRenameKeymap, ELSEWISE.id, []);
    rename('mine', 'Renamed');

    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([]);
    expect(bridge.saveUserKeymap).not.toHaveBeenCalled();
  });
});

describe('useDeleteKeymap', () => {
  test('deletes and selects Elsewise', async () => {
    const other = { id: 'other', keymap: ECLIPSE.keymap };
    const {
      result: remove,
      client,
      bridge,
    } = await probe(
      useDeleteKeymap,
      { source: 'user', id: 'mine' },
      [],
      [{ id: 'mine', keymap: ECLIPSE.keymap }, other],
    );
    remove('mine');

    expect(client.getQueryData(userKeymapsQuery.queryKey)).toEqual([other]);
    expect(client.getQueryData(settingsQuery.queryKey)?.keymap).toEqual(DEFAULT_SETTINGS.keymap);
    await vi.waitFor(() => expect(bridge.deleteUserKeymap).toHaveBeenCalledExactlyOnceWith('mine'));
    await vi.waitFor(() => expect(bridge.save).toHaveBeenCalledExactlyOnceWith(DEFAULT_SETTINGS));
  });
});
