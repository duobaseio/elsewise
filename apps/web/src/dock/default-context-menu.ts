import { type ContextMenuGroup, DEFAULT_COMMANDS, DEFAULT_DOCK_CONTEXT_MENU } from '@elsewise/frontend-plugin';

const { close, split } = DEFAULT_DOCK_CONTEXT_MENU;

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuGroup[] = [
  {
    id: close.id,
    order: close.order,
    items: [
      { order: close.items.close, command: DEFAULT_COMMANDS.panel.close.panel },
      { order: close.items.closeOthers, command: DEFAULT_COMMANDS.panel.close.others },
      { order: close.items.closeAll, command: DEFAULT_COMMANDS.panel.close.all },
      { order: close.items.closeLeft, command: DEFAULT_COMMANDS.panel.close.left },
      { order: close.items.closeRight, command: DEFAULT_COMMANDS.panel.close.right },
    ],
  },
  {
    id: split.id,
    order: split.order,
    items: [
      { order: split.items.moveRight, command: DEFAULT_COMMANDS.panel.split.moveRight },
      { order: split.items.moveDown, command: DEFAULT_COMMANDS.panel.split.moveDown },
    ],
  },
];
