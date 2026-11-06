import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { BundledKeymap, DEFAULT_SETTINGS, type KeymapId } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { Keymap, type Project, type Workspace } from '@elsewise/frontend-plugin';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import type { ITerminalAddon } from '@xterm/xterm';
import { useMemo, useReducer, useRef } from 'react';
import { type CommandManager, isWorkspace } from '@/command/command-manager';
import elsewise from '@/command/keymap/bundled/elsewise.json';
import { eventKeys } from '@/command/keymap/keys';
import { usePluginStore } from '@/plugins/plugin-store';
import { settingsQuery, useSettings, useUpdateSettings } from '@/settings/settings';

export interface LoadedKeymap {
  readonly id: KeymapId;
  readonly keymap: Keymap;
}

/**
 * Changes the selected keymap's keys, and steps back and forth through the changes.
 */
export interface KeymapChanges {
  /**
   * Applies `update` to the keys.
   */
  update: (update: (keys: Keymap['keys']) => Keymap['keys']) => void;

  /**
   * Steps back through the changes.
   */
  undo: () => void;

  /**
   * Steps forward through the undone changes.
   */
  redo: () => void;

  /**
   * Whether there is a change to undo.
   */
  canUndo: boolean;

  /**
   * Whether there is an undone change to redo.
   */
  canRedo: boolean;
}

/**
 * A keymap's keys, with the keys before each change and after each undo, newest last.
 */
interface Changes {
  keys: Keymap['keys'];
  past: readonly Keymap['keys'][];
  future: readonly Keymap['keys'][];
}

/**
 * The changes of the keymap they were taken from.
 */
type History = Omit<Changes, 'keys'> & { keymap: KeymapId };

const BUNDLED_KEYMAPS: readonly LoadedKeymap[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', id: BundledKeymap.parse(path.slice('./bundled/'.length, -'.json'.length)) },
  keymap: Keymap.parse(content),
}));

const ELSEWISE: LoadedKeymap = { id: DEFAULT_SETTINGS.keymap, keymap: Keymap.parse(elsewise) };

/**
 * The user's keymaps, and the ones that could not be read, which it logs.
 */
export const userKeymapsQuery = queryOptions({
  queryKey: ['user-keymaps'],
  queryFn: async () => {
    const keymaps = (await window.bridge?.settings?.loadUserKeymaps()) ?? [];
    for (const keymap of keymaps) {
      if ('error' in keymap) {
        console.error(`Keymap ${keymap.id} failed to load: ${keymap.error}`);
      }
    }
    return keymaps;
  },
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
});

/**
 * Returns the keymap the settings select, falling back to Elsewise's when it is not loaded.
 */
export function useSelectedKeymap(): LoadedKeymap {
  const id = useSettings((settings) => settings.keymap);
  const keymaps = useLoadedKeymaps();
  return useMemo(() => resolveKeymap(keymaps, id), [keymaps, id]);
}

/**
 * Returns Elsewise's keymaps, then the user's and the enabled plugins', leaving out the ones that could not be read.
 */
export function useLoadedKeymaps(): readonly LoadedKeymap[] {
  const plugins = usePluginStore((store) => store.plugins);
  const user = useSuspenseQuery(userKeymapsQuery).data;

  return useMemo(
    () => [
      ...BUNDLED_KEYMAPS,
      ...user.flatMap((entry): LoadedKeymap[] =>
        'error' in entry ? [] : [{ id: { source: 'user', id: entry.id }, keymap: entry.keymap }],
      ),
      ...plugins.flatMap((plugin) =>
        plugin.status === 'enabled'
          ? plugin.keymaps.map(
              ({ id, keymap }): LoadedKeymap => ({ id: { source: 'plugin', plugin: plugin.id, id }, keymap }),
            )
          : [],
      ),
    ],
    [plugins, user],
  );
}

/**
 * Returns the selected keymap's changes.
 */
export function useUpdateKeymap(): KeymapChanges {
  const selected = useSettings((settings) => settings.keymap);
  const keymaps = useLoadedKeymaps();
  const client = useQueryClient();
  const copy = useCopyKeymap();

  const save = useSaveKeymap();

  const history = useRef<History>({ keymap: selected, past: [], future: [] });
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  // The history starts over when another keymap is selected, other than the copy an edit selects.
  if (!sameKeymap(history.current.keymap, selected)) {
    history.current = { keymap: selected, past: [], future: [] };
  }

  const write = (change: (changes: Changes) => Changes | undefined) => {
    const id = client.getQueryData(settingsQuery.queryKey)?.keymap ?? selected;
    const user =
      id.source === 'user'
        ? client.getQueryData(userKeymapsQuery.queryKey)?.find((entry) => entry.id === id.id)
        : undefined;
    const keymap = user !== undefined && 'keymap' in user ? user.keymap : resolveKeymap(keymaps, id).keymap;

    const { past, future } = sameKeymap(history.current.keymap, id) ? history.current : { past: [], future: [] };
    const next = change({ keys: keymap.keys, past, future });
    if (next === undefined) {
      return;
    }

    if (user !== undefined && 'keymap' in user) {
      const changed = { ...keymap, keys: next.keys };
      void client.cancelQueries(userKeymapsQuery);
      client.setQueryData(userKeymapsQuery.queryKey, (entries) =>
        entries?.map((entry) => (entry.id === user.id ? { id: user.id, keymap: changed } : entry)),
      );
      save(user.id, changed);
      history.current = { keymap: id, past: next.past, future: next.future };
    } else {
      const copied = copy({ ...keymap, keys: next.keys });
      history.current = { keymap: { source: 'user', id: copied }, past: next.past, future: next.future };
    }
    rerender();
  };

  return {
    update: (update) => write(({ keys, past }) => ({ keys: update(keys), past: [...past, keys], future: [] })),
    undo: () =>
      write(({ keys, past, future }) => {
        const last = past.at(-1);
        return last === undefined ? undefined : { keys: last, past: past.slice(0, -1), future: [...future, keys] };
      }),
    redo: () =>
      write(({ keys, past, future }) => {
        const last = future.at(-1);
        return last === undefined ? undefined : { keys: last, past: [...past, keys], future: future.slice(0, -1) };
      }),
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
  };
}

/**
 * Resolves the `id`'s keymap, falling back to Elsewise's if it is not among `keymaps`.
 */
export function resolveKeymap(keymaps: readonly LoadedKeymap[], id: KeymapId): LoadedKeymap {
  return keymaps.find((other) => sameKeymap(other.id, id)) ?? ELSEWISE;
}

/**
 * Returns a function that copies `keymap` to the user's keymaps and selects the copy. It returns the copy's id.
 *
 * The copy is named `<name> copy`, numbered if the name or id is taken.
 */
export function useCopyKeymap(): (keymap: Keymap) => string {
  const client = useQueryClient();
  const updateSettings = useUpdateSettings();
  const save = useSaveKeymap();

  return (keymap) => {
    const entries = client.getQueryData(userKeymapsQuery.queryKey) ?? [];
    const baseName = `${keymap.name} copy`;
    const baseId = baseName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[^a-z0-9]+|-+$/g, '');
    let name = baseName;
    let id = baseId;

    // Ids are compared ignoring case, as macOS ignores case in file names.
    for (
      let number = 2;
      entries.some((entry) => entry.id.toLowerCase() === id || ('keymap' in entry && entry.keymap.name === name));
      number++
    ) {
      name = `${baseName} ${number}`;
      id = `${baseId}-${number}`;
    }

    const copy: Keymap = { ...keymap, name };
    void client.cancelQueries(userKeymapsQuery);
    client.setQueryData(userKeymapsQuery.queryKey, (current) => [...(current ?? []), { id, keymap: copy }]);
    save(id, copy);
    updateSettings((settings) => ({ ...settings, keymap: { source: 'user', id } }));
    return id;
  };
}

/**
 * Returns a function that renames the user's keymap with `id` to `name`.
 */
export function useRenameKeymap(): (id: string, name: string) => void {
  const client = useQueryClient();
  const save = useSaveKeymap();

  return (id, name) => {
    const entry = client.getQueryData(userKeymapsQuery.queryKey)?.find((entry) => entry.id === id);
    if (entry === undefined || !('keymap' in entry)) {
      return;
    }

    const renamed = { ...entry.keymap, name };
    void client.cancelQueries(userKeymapsQuery);
    client.setQueryData(userKeymapsQuery.queryKey, (entries) =>
      entries?.map((other) => (other.id === id ? { id, keymap: renamed } : other)),
    );
    save(id, renamed);
  };
}

/**
 * Returns a function that deletes the user's keymap with `id` and selects Elsewise's.
 */
export function useDeleteKeymap(): (id: string) => void {
  const client = useQueryClient();
  const updateSettings = useUpdateSettings();
  const { mutate } = useMutation({
    mutationFn: async (id: string) => window.bridge?.settings?.deleteUserKeymap(id),
    onError: (error: unknown) => {
      console.error('keymap: delete failed', error);
    },
  });

  return (id) => {
    void client.cancelQueries(userKeymapsQuery);
    client.setQueryData(userKeymapsQuery.queryKey, (entries) => entries?.filter((entry) => entry.id !== id));
    mutate(id);
    updateSettings((settings) => ({ ...settings, keymap: DEFAULT_SETTINGS.keymap }));
  };
}

function useSaveKeymap(): (id: string, keymap: Keymap) => void {
  const { mutate } = useMutation({
    mutationFn: async ({ id, keymap }: { id: string; keymap: Keymap }) =>
      window.bridge?.settings?.saveUserKeymap(id, keymap),
    onError: (error: unknown) => {
      console.error('keymap: save failed', error);
    },
  });
  return (id, keymap) => mutate({ id, keymap });
}

export function sameKeymap(a: KeymapId, b: KeymapId): boolean {
  return a.source === 'plugin'
    ? b.source === 'plugin' && a.plugin === b.plugin && a.id === b.id
    : b.source === a.source && a.id === b.id;
}

/**
 * Runs the application commands bound to the keys pressed in `window`.
 *
 * Returns a disposable that stops it.
 */
export function installApplicationKeys(window: Window, commands: CommandManager): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }

    for (const key of eventKeys(event, PLATFORM)) {
      if (commands.keymap.keys.application.get(key)?.some((id) => commands.run(id))) {
        event.preventDefault();
        return;
      }
    }
  };

  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}

/**
 * Runs the commands of `target`'s scope bound to the key of `event`, pressed in `target`'s sidebar row.
 */
export function runSidebarKeys(commands: CommandManager, target: Project | Workspace, event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }

  const keys = isWorkspace(target) ? commands.keymap.keys.workspace : commands.keymap.keys.project;
  for (const key of eventKeys(event, PLATFORM)) {
    if (keys.get(key)?.some((id) => commands.run(id, target))) {
      event.preventDefault();
      return;
    }
  }
}

/**
 * Returns a keymap that runs the commands bound to `keys` when pressed in an editor.
 *
 * A key that runs no command falls through to the next keymap.
 */
export function editorKeymap(commands: CommandManager, keys: ReadonlyMap<string, readonly string[]>): Extension {
  return Prec.high(
    keymap.of(
      [...keys].map(([key, ids]) => ({
        key,
        run: (view) => ids.some((id) => commands.run(id, view)),
      })),
    ),
  );
}

/**
 * Returns an add-on that runs the terminal commands bound to a key pressed in a terminal.
 *
 * A key that does not run a command is handled by the shell.
 */
export function terminalKeymap(commands: CommandManager): ITerminalAddon {
  return {
    activate(terminal) {
      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown' || event.isComposing) {
          return true;
        }

        for (const key of eventKeys(event, PLATFORM)) {
          if (commands.keymap.keys.terminal.get(key)?.some((id) => commands.run(id, terminal))) {
            // Chromium would also paste on its own paste event, which xterm listens for, so the text would land twice.
            event.preventDefault();
            return false;
          }
        }
        return true;
      });
    },
    dispose() {},
  };
}
