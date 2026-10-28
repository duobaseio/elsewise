import { type ContextMenuGroup, DEFAULT_COMMANDS, DEFAULT_TERMINAL_CONTEXT_MENU } from '@elsewise/plugin';

const { search, clipboard, buffer } = DEFAULT_TERMINAL_CONTEXT_MENU;

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuGroup[] = [
  {
    id: search.id,
    order: search.order,
    items: [{ order: search.items.find, command: DEFAULT_COMMANDS.terminal.search.find }],
  },
  {
    id: clipboard.id,
    order: clipboard.order,
    items: [
      { order: clipboard.items.copy, command: DEFAULT_COMMANDS.terminal.clipboard.copy },
      { order: clipboard.items.paste, command: DEFAULT_COMMANDS.terminal.clipboard.paste },
      { order: clipboard.items.selectAll, command: DEFAULT_COMMANDS.terminal.selection.selectAll },
    ],
  },
  {
    id: buffer.id,
    order: buffer.order,
    items: [{ order: buffer.items.clear, command: DEFAULT_COMMANDS.terminal.buffer.clear }],
  },
];
