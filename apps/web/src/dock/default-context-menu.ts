import { type ContextMenuGroup, DEFAULT_COMMANDS, DEFAULT_DOCK_CONTEXT_MENU } from '@elsewise/frontend-plugin';
import { FILE_MANAGER } from '@/projects/commands';

const { close, edit, clipboard, open, split } = DEFAULT_DOCK_CONTEXT_MENU;

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
    items: [{ order: split.items.splitAndMove.order, label: 'Split and move', submenu: split.items.splitAndMove.id }],
  },
  {
    id: split.items.splitAndMove.groups.directions.id,
    order: split.items.splitAndMove.groups.directions.order,
    in: split.items.splitAndMove.id,
    items: [
      {
        order: split.items.splitAndMove.groups.directions.items.right,
        label: 'Right',
        command: DEFAULT_COMMANDS.panel.split.moveRight,
      },
      {
        order: split.items.splitAndMove.groups.directions.items.down,
        label: 'Down',
        command: DEFAULT_COMMANDS.panel.split.moveDown,
      },
    ],
  },
  {
    id: edit.id,
    order: edit.order,
    items: [{ order: edit.items.rename, command: DEFAULT_COMMANDS.panel.terminal.rename }],
  },
  {
    id: clipboard.id,
    order: clipboard.order,
    items: [{ order: clipboard.items.copyPath.order, label: 'Copy path', submenu: clipboard.items.copyPath.id }],
  },
  {
    id: clipboard.items.copyPath.groups.paths.id,
    order: clipboard.items.copyPath.groups.paths.order,
    in: clipboard.items.copyPath.id,
    items: [
      {
        order: clipboard.items.copyPath.groups.paths.items.absolute,
        label: 'Absolute',
        command: DEFAULT_COMMANDS.panel.file.copyPath,
      },
      {
        order: clipboard.items.copyPath.groups.paths.items.relative,
        label: 'From workspace',
        command: DEFAULT_COMMANDS.panel.file.copyRelativePath,
      },
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
        command: DEFAULT_COMMANDS.panel.file.openFileManager,
      },
    ],
  },
];
