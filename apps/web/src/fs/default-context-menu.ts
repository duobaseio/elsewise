import { type ContextMenuGroup, DEFAULT_COMMANDS, DEFAULT_FILE_TREE_CONTEXT_MENU } from '@elsewise/frontend-plugin';
import { FILE_MANAGER } from '@/projects/commands';

const { open } = DEFAULT_FILE_TREE_CONTEXT_MENU;

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuGroup[] = [
  {
    id: open.id,
    order: open.order,
    items: [{ order: open.items.openIn.order, label: 'Open in', submenu: open.items.openIn.id }],
  },
  {
    id: open.items.openIn.groups.apps.id,
    order: open.items.openIn.groups.apps.order,
    in: open.items.openIn.id,
    items: [
      {
        order: open.items.openIn.groups.apps.items.fileManager,
        label: FILE_MANAGER,
        command: DEFAULT_COMMANDS.fileTree.open.fileManager,
      },
    ],
  },
];
