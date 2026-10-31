import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { BundledKeymap, type KeymapId } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { Keymap } from '@elsewise/plugin';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import type { ITerminalAddon } from '@xterm/xterm';
import { useMemo } from 'react';
import type { CommandManager } from '@/command/command-manager';
import elsewise from '@/command/keymap/bundled/elsewise.json';
import { eventKeys } from '@/command/keymap/keys';
import { usePluginStore } from '@/plugins/plugin-store';
import { useSettings } from '@/settings/settings';

export interface LoadedKeymap {
  readonly id: KeymapId;
  readonly keymap: Keymap;
}

const BUNDLED_KEYMAPS: readonly LoadedKeymap[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', id: BundledKeymap.parse(path.slice('./bundled/'.length, -'.json'.length)) },
  keymap: Keymap.parse(content),
}));

const ELSEWISE = Keymap.parse(elsewise);

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
 * Returns the keymap the settings select, falling back to Elsewise's when it is not loaded.
 */
export function useSelectedKeymap(): Keymap {
  const id = useSettings((settings) => settings.keymap);
  const keymaps = useLoadedKeymaps();
  return useMemo(() => resolveKeymap(keymaps, id), [keymaps, id]);
}

/**
 * Resolves the `id`'s keymap, falling back to Elsewise's if it is not among `keymaps`.
 */
export function resolveKeymap(keymaps: readonly LoadedKeymap[], id: KeymapId): Keymap {
  return keymaps.find((other) => sameKeymap(other.id, id))?.keymap ?? ELSEWISE;
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
