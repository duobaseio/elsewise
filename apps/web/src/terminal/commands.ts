import { DEFAULT_COMMAND_CATEGORIES, DEFAULT_COMMANDS, DEFAULT_KEYS, type TerminalCommand } from '@elsewise/plugin';

export const TERMINAL_COPY: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.clipboard.copy,
  category: DEFAULT_COMMAND_CATEGORIES.terminal.id,
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
  category: DEFAULT_COMMAND_CATEGORIES.terminal.id,
  label: 'Paste',
  defaultKeys: DEFAULT_KEYS.terminal.clipboard.paste,
  enabled: (_, terminal) => !terminal.options.disableStdin,
  run: (_, terminal) => {
    void navigator.clipboard.readText().then((text) => terminal.paste(text));
    return true;
  },
};

export const TERMINAL_SELECT_ALL: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.selection.selectAll,
  category: DEFAULT_COMMAND_CATEGORIES.terminal.id,
  label: 'Select all',
  defaultKeys: DEFAULT_KEYS.terminal.selection.selectAll,
  run: (_, terminal) => {
    terminal.selectAll();
    return true;
  },
};

export const TERMINAL_CLEAR: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.buffer.clear,
  category: DEFAULT_COMMAND_CATEGORIES.terminal.id,
  label: 'Clear terminal',
  defaultKeys: DEFAULT_KEYS.terminal.buffer.clear,
  run: (_, terminal) => {
    terminal.clear();
    return true;
  },
};
