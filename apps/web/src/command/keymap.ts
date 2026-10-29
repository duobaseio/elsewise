import { type Extension, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { BundledKeymap, type KeymapId } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { Keymap } from '@elsewise/plugin';
import type { ITerminalAddon } from '@xterm/xterm';
import { useMemo } from 'react';
import type { CommandManager } from '@/command/command-manager';
import { eventKeys } from '@/command/keys';
import { useSettings } from '@/settings/settings';

export interface LoadedKeymap {
  readonly id: KeymapId;
  readonly keymap: Keymap;
}

// TODO: add support for plugin keymaps.
export const KEYMAPS: readonly LoadedKeymap[] = Object.entries(
  import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' }),
).map(([path, content]) => ({
  id: { source: 'elsewise', name: BundledKeymap.parse(path.slice('./bundled/'.length, -'.json'.length)) },
  keymap: Keymap.parse(content),
}));

export const ELSEWISE = KEYMAPS.find(({ id }) => id.name === 'elsewise') as LoadedKeymap;

export function useKeymap(): Keymap {
  const id = useSettings((settings) => settings.keymap);
  return useMemo(() => resolveKeymap(KEYMAPS, id), [id]);
}

/**
 * Resolves the `id`'s keymap, falling back to Elsewise's if it is not among `keymaps`.
 */
export function resolveKeymap(keymaps: readonly LoadedKeymap[], id: KeymapId): Keymap {
  const loaded = keymaps.find(
    ({ id: other }) =>
      other.source === id.source &&
      other.name === id.name &&
      (other.source !== 'plugin' || (id.source === 'plugin' && other.plugin === id.plugin)),
  );
  if (loaded === undefined) {
    console.warn(`Keymap ${id.source === 'plugin' ? `${id.plugin}/${id.name}` : id.name} not found, using Elsewise's`);
  }

  return (loaded ?? ELSEWISE).keymap;
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
