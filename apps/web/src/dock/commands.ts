import { toast } from '@elsewise/components/components/toast';
import {
  type Application,
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type Panel,
  type PanelCommand,
} from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { absolutePath } from '@/fs/commands';
import { FILE_MANAGER } from '@/projects/commands';

export const PANEL_CLOSE: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.close.panel,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Close',
  defaultKeys: DEFAULT_KEYS.panel.close.panel,
  shown: (_, panel) => panel.closable,
  enabled: (_, panel) => panel.closable,
  run: (application, panel) => close(application, [panel]),
};

export const PANEL_CLOSE_OTHERS: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.close.others,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Close others',
  defaultKeys: DEFAULT_KEYS.panel.close.others,
  shown: (_, panel) => panel.tab,
  enabled: (application, panel) => panel.tab && closable(application, panel).some((other) => other.id !== panel.id),
  run: (application, panel) =>
    close(
      application,
      closable(application, panel).filter((other) => other.id !== panel.id),
    ),
};

export const PANEL_CLOSE_ALL: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.close.all,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Close all',
  defaultKeys: DEFAULT_KEYS.panel.close.all,
  shown: (_, panel) => panel.tab,
  enabled: (application, panel) => panel.tab && closable(application, panel).length > 0,
  run: (application, panel) => close(application, closable(application, panel)),
};

export const PANEL_CLOSE_LEFT: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.close.left,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Close to the left',
  defaultKeys: DEFAULT_KEYS.panel.close.left,
  shown: (application, panel) => panel.tab && closableBefore(application, panel).length > 0,
  enabled: (application, panel) => panel.tab && closableBefore(application, panel).length > 0,
  run: (application, panel) => close(application, closableBefore(application, panel)),
};

export const PANEL_CLOSE_RIGHT: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.close.right,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Close to the right',
  defaultKeys: DEFAULT_KEYS.panel.close.right,
  shown: (application, panel) => panel.tab && closableAfter(application, panel).length > 0,
  enabled: (application, panel) => panel.tab && closableAfter(application, panel).length > 0,
  run: (application, panel) => close(application, closableAfter(application, panel)),
};

export const PANEL_SPLIT_MOVE_RIGHT: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.split.moveRight,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Split and move right',
  defaultKeys: DEFAULT_KEYS.panel.split.moveRight,
  shown: (application, panel) => panel.tab && group(application, panel).length > 1,
  enabled: (application, panel) => panel.tab && group(application, panel).length > 1,
  run: ({ docks }, panel) => {
    docks.active?.move(panel, { group: 'right', of: panel });
    return docks.active !== null;
  },
};

export const PANEL_SPLIT_MOVE_DOWN: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.split.moveDown,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Split and move down',
  defaultKeys: DEFAULT_KEYS.panel.split.moveDown,
  shown: (application, panel) => panel.tab && group(application, panel).length > 1,
  enabled: (application, panel) => panel.tab && group(application, panel).length > 1,
  run: ({ docks }, panel) => {
    docks.active?.move(panel, { group: 'below', of: panel });
    return docks.active !== null;
  },
};

export const PANEL_FILE_COPY_PATH: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.file.copyPath,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Copy absolute path',
  defaultKeys: DEFAULT_KEYS.panel.file.copyPath,
  shown: (_, panel) => panel.type === 'file',
  enabled: (_, panel) => panel.type === 'file',
  run: ({ docks }, panel) => {
    if (panel.type !== 'file' || docks.active === null) {
      return false;
    }

    void navigator.clipboard.writeText(absolutePath(docks.active.workspace, panel.relativePath));
    return true;
  },
};

export const PANEL_FILE_COPY_RELATIVE_PATH: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.file.copyRelativePath,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Copy path from workspace',
  defaultKeys: DEFAULT_KEYS.panel.file.copyRelativePath,
  shown: (_, panel) => panel.type === 'file',
  enabled: (_, panel) => panel.type === 'file',
  run: (_, panel) => {
    if (panel.type !== 'file') {
      return false;
    }

    void navigator.clipboard.writeText(panel.relativePath);
    return true;
  },
};

export const PANEL_FILE_OPEN_FILE_MANAGER: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.file.openFileManager,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: `Open in ${FILE_MANAGER}`,
  defaultKeys: DEFAULT_KEYS.panel.file.openFileManager,
  shown: ({ docks }, panel) =>
    panel.type === 'file' &&
    docks.active?.workspace.id.daemon === LOCAL_DAEMON_ID &&
    docks.active.workspace.state !== 'missing' &&
    window.bridge?.window?.showPath !== undefined,
  enabled: ({ docks }, panel) =>
    panel.type === 'file' &&
    docks.active?.workspace.id.daemon === LOCAL_DAEMON_ID &&
    docks.active.workspace.state !== 'missing' &&
    window.bridge?.window?.showPath !== undefined,
  run: ({ docks, platform }: ApplicationManager, panel) => {
    if (panel.type !== 'file' || docks.active === null) {
      return false;
    }

    void platform
      .showPath(absolutePath(docks.active.workspace, panel.relativePath))
      .catch((error: Error) =>
        toast.add({ type: 'error', title: `Opening ${FILE_MANAGER} failed`, description: error.message }),
      );
    return true;
  },
};

export const PANEL_TERMINAL_RENAME: PanelCommand = {
  scope: 'panel',
  id: DEFAULT_COMMANDS.panel.terminal.rename,
  group: DEFAULT_COMMAND_GROUPS.panel.id,
  label: 'Rename session…',
  defaultKeys: DEFAULT_KEYS.panel.terminal.rename,
  shown: (_, panel) => panel.type === 'terminal',
  enabled: (_, panel) => panel.type === 'terminal',
  run: ({ terminals }: ApplicationManager, panel) => {
    if (panel.type !== 'terminal') {
      return false;
    }

    terminals.renaming = panel.session;
    return true;
  },
};

function closableBefore(application: Application, panel: Panel): readonly Panel[] {
  const panels = group(application, panel);
  const index = panels.findIndex((other) => other.id === panel.id);
  return panels.slice(0, index).filter((other) => other.closable);
}

function closableAfter(application: Application, panel: Panel): readonly Panel[] {
  const panels = group(application, panel);
  const index = panels.findIndex((other) => other.id === panel.id);
  return panels.slice(index + 1).filter((other) => other.closable);
}

function closable(application: Application, panel: Panel): readonly Panel[] {
  return group(application, panel).filter((other) => other.closable);
}

function group({ docks }: Application, panel: Panel): readonly Panel[] {
  return docks.active?.groups.find((group) => group.panels.some((other) => other.id === panel.id))?.panels ?? [];
}

function close({ docks }: Application, panels: readonly Panel[]): boolean {
  const dock = docks.active;
  if (dock === null) {
    return false;
  }

  void (async () => {
    for (const panel of panels) {
      await dock.close(panel).catch((error: Error) =>
        toast.add({
          type: 'error',
          title: panel.type === 'terminal' ? 'Deleting the terminal failed' : 'Closing the tab failed',
          description: error.message,
        }),
      );
    }
  })();
  return true;
}
