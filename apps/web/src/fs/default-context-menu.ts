import { type ContextMenuGroup, DEFAULT_COMMANDS, DEFAULT_FILE_TREE_CONTEXT_MENU } from '@elsewise/frontend-plugin';
import { FILE_MANAGER } from '@/projects/commands';

const { clipboard, edit, open } = DEFAULT_FILE_TREE_CONTEXT_MENU;

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuGroup[] = [
  {
    id: clipboard.id,
    order: clipboard.order,
    items: [
      { order: clipboard.items.cut, command: DEFAULT_COMMANDS.fileTree.clipboard.cut },
      { order: clipboard.items.copy, command: DEFAULT_COMMANDS.fileTree.clipboard.copy },
      { order: clipboard.items.copyPath.order, label: 'Copy path', submenu: clipboard.items.copyPath.id },
      { order: clipboard.items.paste, command: DEFAULT_COMMANDS.fileTree.clipboard.paste },
    ],
  },
  {
    id: clipboard.items.copyPath.groups.paths.id,
    order: clipboard.items.copyPath.groups.paths.order,
    in: clipboard.items.copyPath.id,
    items: [
      {
        order: clipboard.items.copyPath.groups.paths.items.absolute,
        label: 'Absolute path',
        command: DEFAULT_COMMANDS.fileTree.clipboard.copyPath,
      },
      {
        order: clipboard.items.copyPath.groups.paths.items.relative,
        label: 'Path from root',
        command: DEFAULT_COMMANDS.fileTree.clipboard.copyRelativePath,
      },
    ],
  },
  {
    id: edit.id,
    order: edit.order,
    items: [
      { order: edit.items.rename, command: DEFAULT_COMMANDS.fileTree.edit.rename },
      { order: edit.items.delete, command: DEFAULT_COMMANDS.fileTree.edit.delete },
    ],
  },
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
