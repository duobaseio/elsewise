import { DEFAULT_COMMAND_CATEGORIES, DEFAULT_COMMANDS, DEFAULT_KEYS, type TerminalCommand } from '@elsewise/plugin';

// TODO: Open the search directly once terminals have state that commands can reach.
export const FIND = 'elsewise-terminal-find';

export const TERMINAL_FIND: TerminalCommand = {
  scope: 'terminal',
  id: DEFAULT_COMMANDS.terminal.search.find,
  category: DEFAULT_COMMAND_CATEGORIES.terminal.id,
  label: 'Find…',
  defaultKeys: DEFAULT_KEYS.terminal.search.find,
  run: (_, terminal) =>
    terminal.element !== undefined && !terminal.element.dispatchEvent(new Event(FIND, { cancelable: true })),
};
