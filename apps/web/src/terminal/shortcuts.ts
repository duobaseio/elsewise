import { PLATFORM } from '@elsewise/components/lib/platform';
import type { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

/**
 * A key the terminal handles itself instead of sending it to the shell.
 *
 * It is pressed with Cmd on macOS, and with Ctrl-Shift elsewhere, where Ctrl alone belongs to the shell.
 */
export interface TerminalShortcut {
  /**
   * The key, e.g. `c`.
   */
  readonly key: string;

  run(terminal: Terminal): void;
}

// TODO: Replace with terminal commands once commands have a terminal scope.
/**
 * Runs the terminal's shortcuts, keeping their keys from the shell.
 */
export class TerminalShortcuts implements ITerminalAddon {
  private readonly shortcuts: TerminalShortcut[];

  constructor(shortcuts: readonly TerminalShortcut[]) {
    this.shortcuts = [...shortcuts];
  }

  /**
   * Adds `shortcuts` until the returned disposable is disposed.
   */
  add(shortcuts: readonly TerminalShortcut[]): IDisposable {
    this.shortcuts.push(...shortcuts);
    return {
      dispose: () => {
        for (const shortcut of shortcuts) {
          const index = this.shortcuts.indexOf(shortcut);
          if (index !== -1) {
            this.shortcuts.splice(index, 1);
          }
        }
      },
    };
  }

  activate(terminal: Terminal): void {
    terminal.attachCustomKeyEventHandler((event) => {
      const shortcut = this.shortcuts.find((shortcut) => isShortcut(event, shortcut.key));
      if (shortcut === undefined) {
        return true;
      }

      if (event.type === 'keydown') {
        shortcut.run(terminal);
      }
      // Chromium fires its own paste event for both chords and xterm listens for it, so the text would land twice.
      event.preventDefault();
      return false;
    });
  }

  dispose(): void {}
}

/**
 * Returns whether `event` presses `key` as a terminal shortcut.
 */
export function isShortcut(event: KeyboardEvent, key: string): boolean {
  const chord =
    PLATFORM === 'mac'
      ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
  return chord && event.key.toLowerCase() === key;
}

/**
 * Copies the selection.
 */
export const COPY: TerminalShortcut = {
  key: 'c',
  run: (terminal) => {
    if (terminal.hasSelection()) {
      void navigator.clipboard.writeText(terminal.getSelection());
    }
  },
};

/**
 * Pastes the clipboard.
 */
export const PASTE: TerminalShortcut = {
  key: 'v',
  run: (terminal) => {
    void navigator.clipboard.readText().then((text) => terminal.paste(text));
  },
};
