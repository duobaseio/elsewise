import { DEFAULT_COMMANDS, DEFAULT_KEYS, type TerminalCommand } from '@elsewise/plugin';

export const TERMINAL_COPY: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.clipboard.copy,
  label: 'Copy',
  defaultKeys: DEFAULT_KEYS.terminal.clipboard.copy,
  shown: (_, terminal) => terminal.hasSelection(),
  run: (_, terminal) => {
    if (terminal.hasSelection()) {
      void navigator.clipboard.writeText(terminal.getSelection());
    }
    return true;
  },
};

export const TERMINAL_PASTE: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.clipboard.paste,
  label: 'Paste',
  defaultKeys: DEFAULT_KEYS.terminal.clipboard.paste,
  enabled: (_, terminal) => !terminal.options.disableStdin,
  run: (_, terminal) => {
    void navigator.clipboard.readText().then((text) => terminal.paste(text));
    return true;
  },
};
