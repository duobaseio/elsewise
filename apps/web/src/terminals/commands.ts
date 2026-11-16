import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type TerminalCommand,
} from '@elsewise/frontend-plugin';

export const TERMINAL_COPY: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.clipboard.copy,
  group: DEFAULT_COMMAND_GROUPS.terminal.id,
  label: 'Copy',
  defaultKeys: DEFAULT_KEYS.terminal.clipboard.copy,
  shown: (_, view) => view.terminal.hasSelection(),
  run: (_, view) => {
    if (view.terminal.hasSelection()) {
      void navigator.clipboard.writeText(view.terminal.getSelection());
    }
    return true;
  },
};

export const TERMINAL_PASTE: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.clipboard.paste,
  group: DEFAULT_COMMAND_GROUPS.terminal.id,
  label: 'Paste',
  defaultKeys: DEFAULT_KEYS.terminal.clipboard.paste,
  enabled: (_, view) => !view.terminal.options.disableStdin,
  run: (_, view) => {
    void navigator.clipboard.readText().then((text) => view.terminal.paste(text));
    return true;
  },
};

export const TERMINAL_SELECT_ALL: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.selection.selectAll,
  group: DEFAULT_COMMAND_GROUPS.terminal.id,
  label: 'Select all',
  defaultKeys: DEFAULT_KEYS.terminal.selection.selectAll,
  run: (_, view) => {
    view.terminal.selectAll();
    return true;
  },
};

export const TERMINAL_CLEAR: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.buffer.clear,
  group: DEFAULT_COMMAND_GROUPS.terminal.id,
  label: 'Clear terminal',
  defaultKeys: DEFAULT_KEYS.terminal.buffer.clear,
  run: (_, view) => {
    view.terminal.clear();
    return true;
  },
};
