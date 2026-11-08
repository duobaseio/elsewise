import { toast } from '@elsewise/components/components/toast';
import { PLATFORM } from '@elsewise/components/lib/platform';
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  type ProjectCommand,
  type WorkspaceAggregateStatus,
  type WorkspaceCommand,
} from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';
import { LOCAL_DAEMON_ID } from '@/daemon';

export const FILE_MANAGER = PLATFORM === 'mac' ? 'Finder' : PLATFORM === 'windows' ? 'File Explorer' : 'File Manager';

const UNREAD: ReadonlySet<WorkspaceAggregateStatus> = new Set(['partial', 'complete']);

export const PROJECT_NEW_WORKSPACE: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.workspace.new,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'New workspace…',
  defaultKeys: DEFAULT_KEYS.project.workspace.new,
  enabled: (_, project) => project.state === 'ok',
  run: ({ sidebar }: ApplicationManager, project) => {
    sidebar.newWorkspaceDialog.openWithPayload({ project: project.id });
    return true;
  },
};

export const PROJECT_IMPORT_WORKSPACE: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.workspace.import,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'Import workspace…',
  defaultKeys: DEFAULT_KEYS.project.workspace.import,
  enabled: (_, project) => project.state === 'ok',
  run: ({ sidebar }: ApplicationManager, project) => {
    sidebar.importWorkspaceDialog.openWithPayload({ project: project.id });
    return true;
  },
};

export const PROJECT_COPY_PATH: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.clipboard.copyPath,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'Copy path',
  defaultKeys: DEFAULT_KEYS.project.clipboard.copyPath,
  run: (_, project) => {
    void navigator.clipboard.writeText(project.absolutePath);
    return true;
  },
};

export const PROJECT_RENAME: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.edit.rename,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'Rename…',
  defaultKeys: DEFAULT_KEYS.project.edit.rename,
  run: ({ sidebar }: ApplicationManager, project) => {
    sidebar.renaming = project.id;
    return true;
  },
};

export const PROJECT_DELETE: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.edit.delete,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'Delete…',
  defaultKeys: DEFAULT_KEYS.project.edit.delete,
  run: ({ sidebar }: ApplicationManager, project) => {
    sidebar.deleteProjectDialog.openWithPayload(project.id);
    return true;
  },
};

export const PROJECT_OPEN_FILE_MANAGER: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.open.fileManager,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: `Open in ${FILE_MANAGER}`,
  defaultKeys: DEFAULT_KEYS.project.open.fileManager,
  shown: (_, project) =>
    project.id.daemon === LOCAL_DAEMON_ID &&
    project.state !== 'missing' &&
    window.bridge?.window?.openFolder !== undefined,
  enabled: (_, project) => project.state !== 'missing',
  run: ({ platform }, project) => {
    void platform
      .openFolder(project.absolutePath)
      .catch((error: Error) =>
        toast.add({ type: 'error', title: `Opening ${FILE_MANAGER} failed`, description: error.message }),
      );
    return true;
  },
};

export const WORKSPACE_COPY_PATH: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.clipboard.copyPath,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: 'Copy path',
  defaultKeys: DEFAULT_KEYS.workspace.clipboard.copyPath,
  run: (_, workspace) => {
    void navigator.clipboard.writeText(workspace.absolutePath);
    return true;
  },
};

export const WORKSPACE_RENAME: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.edit.rename,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: 'Rename…',
  defaultKeys: DEFAULT_KEYS.workspace.edit.rename,
  run: ({ sidebar }: ApplicationManager, workspace) => {
    sidebar.renaming = workspace.id;
    return true;
  },
};

export const WORKSPACE_DELETE: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.edit.delete,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: 'Delete…',
  defaultKeys: DEFAULT_KEYS.workspace.edit.delete,
  shown: (_, workspace) => !workspace.main,
  enabled: (_, workspace) => !workspace.main,
  run: ({ sidebar }: ApplicationManager, workspace) => {
    sidebar.deleteWorkspaceDialog.openWithPayload(workspace.id);
    return true;
  },
};

export const WORKSPACE_MARK_READ: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.status.markRead,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: 'Mark as read',
  defaultKeys: DEFAULT_KEYS.workspace.status.markRead,
  shown: ({ projects }, workspace) => UNREAD.has(projects.workspaces.status(workspace.id)),
  enabled: ({ projects }, workspace) => UNREAD.has(projects.workspaces.status(workspace.id)),
  run: ({ projects }, workspace) => {
    projects.workspaces.resetStatus(workspace.id);
    return true;
  },
};

export const WORKSPACE_OPEN_FILE_MANAGER: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.open.fileManager,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: `Open in ${FILE_MANAGER}`,
  defaultKeys: DEFAULT_KEYS.workspace.open.fileManager,
  shown: (_, workspace) =>
    workspace.id.daemon === LOCAL_DAEMON_ID &&
    workspace.state !== 'missing' &&
    window.bridge?.window?.openFolder !== undefined,
  enabled: (_, workspace) => workspace.state !== 'missing',
  run: ({ platform }, workspace) => {
    void platform
      .openFolder(workspace.absolutePath)
      .catch((error: Error) =>
        toast.add({ type: 'error', title: `Opening ${FILE_MANAGER} failed`, description: error.message }),
      );
    return true;
  },
};
