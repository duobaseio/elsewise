import {
  type ContextMenuGroup,
  DEFAULT_COMMANDS,
  DEFAULT_PROJECT_CONTEXT_MENU,
  DEFAULT_WORKSPACE_CONTEXT_MENU,
} from '@elsewise/frontend-plugin';

export const DEFAULT_PROJECT_MENU: readonly ContextMenuGroup[] = [
  {
    id: DEFAULT_PROJECT_CONTEXT_MENU.clipboard.id,
    order: DEFAULT_PROJECT_CONTEXT_MENU.clipboard.order,
    items: [
      {
        order: DEFAULT_PROJECT_CONTEXT_MENU.clipboard.items.copyPath,
        command: DEFAULT_COMMANDS.project.clipboard.copyPath,
      },
    ],
  },
  {
    id: DEFAULT_PROJECT_CONTEXT_MENU.delete.id,
    order: DEFAULT_PROJECT_CONTEXT_MENU.delete.order,
    items: [{ order: DEFAULT_PROJECT_CONTEXT_MENU.delete.items.delete, command: DEFAULT_COMMANDS.project.edit.delete }],
  },
  {
    id: DEFAULT_PROJECT_CONTEXT_MENU.open.id,
    order: DEFAULT_PROJECT_CONTEXT_MENU.open.order,
    items: [
      { order: DEFAULT_PROJECT_CONTEXT_MENU.open.items.newWorkspace, command: DEFAULT_COMMANDS.project.workspace.new },
      {
        order: DEFAULT_PROJECT_CONTEXT_MENU.open.items.openIn.order,
        label: 'Open in',
        submenu: DEFAULT_PROJECT_CONTEXT_MENU.open.items.openIn.id,
      },
    ],
  },
  {
    id: DEFAULT_PROJECT_CONTEXT_MENU.open.items.openIn.groups.apps.id,
    order: DEFAULT_PROJECT_CONTEXT_MENU.open.items.openIn.groups.apps.order,
    in: DEFAULT_PROJECT_CONTEXT_MENU.open.items.openIn.id,
    items: [],
  },
];

export const DEFAULT_WORKSPACE_MENU: readonly ContextMenuGroup[] = [
  {
    id: DEFAULT_WORKSPACE_CONTEXT_MENU.clipboard.id,
    order: DEFAULT_WORKSPACE_CONTEXT_MENU.clipboard.order,
    items: [
      {
        order: DEFAULT_WORKSPACE_CONTEXT_MENU.clipboard.items.copyPath,
        command: DEFAULT_COMMANDS.workspace.clipboard.copyPath,
      },
    ],
  },
  {
    id: DEFAULT_WORKSPACE_CONTEXT_MENU.delete.id,
    order: DEFAULT_WORKSPACE_CONTEXT_MENU.delete.order,
    items: [
      { order: DEFAULT_WORKSPACE_CONTEXT_MENU.delete.items.delete, command: DEFAULT_COMMANDS.workspace.edit.delete },
    ],
  },
  {
    id: DEFAULT_WORKSPACE_CONTEXT_MENU.status.id,
    order: DEFAULT_WORKSPACE_CONTEXT_MENU.status.order,
    items: [
      {
        order: DEFAULT_WORKSPACE_CONTEXT_MENU.status.items.markRead,
        command: DEFAULT_COMMANDS.workspace.status.markRead,
      },
    ],
  },
  {
    id: DEFAULT_WORKSPACE_CONTEXT_MENU.open.id,
    order: DEFAULT_WORKSPACE_CONTEXT_MENU.open.order,
    items: [
      {
        order: DEFAULT_WORKSPACE_CONTEXT_MENU.open.items.openIn.order,
        label: 'Open in',
        submenu: DEFAULT_WORKSPACE_CONTEXT_MENU.open.items.openIn.id,
      },
    ],
  },
  {
    id: DEFAULT_WORKSPACE_CONTEXT_MENU.open.items.openIn.groups.apps.id,
    order: DEFAULT_WORKSPACE_CONTEXT_MENU.open.items.openIn.groups.apps.order,
    in: DEFAULT_WORKSPACE_CONTEXT_MENU.open.items.openIn.id,
    items: [],
  },
];
