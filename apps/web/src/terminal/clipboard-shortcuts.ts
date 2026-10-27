import { PLATFORM } from '@elsewise/components/lib/platform';
import type { ITerminalAddon, Terminal } from '@xterm/xterm';

export class ClipboardShortcuts implements ITerminalAddon {
  activate(terminal: Terminal): void {
    terminal.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      const chord =
        PLATFORM === 'mac'
          ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
          : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
      if (!chord || (key !== 'c' && key !== 'v')) {
        return true;
      }

      if (event.type === 'keydown') {
        if (key === 'c') {
          if (terminal.hasSelection()) {
            void navigator.clipboard.writeText(terminal.getSelection());
          }
        } else {
          void navigator.clipboard.readText().then((text) => terminal.paste(text));
        }
      }
      // Chromium fires its own paste event for both chords and xterm listens for it, so the text would land twice.
      event.preventDefault();
      return false;
    });
  }

  dispose(): void {}
}
