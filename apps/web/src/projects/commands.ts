import { toast } from '@elsewise/components/components/toast';
import { PLATFORM } from '@elsewise/components/lib/platform';
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  DEFAULT_ROUTES,
  type ProjectCommand,
  type WorkspaceCommand,
} from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';
import { LOCAL_DAEMON_ID } from '@/daemon';

export const FILE_MANAGER = PLATFORM === 'mac' ? 'Finder' : PLATFORM === 'windows' ? 'File Explorer' : 'File Manager';

export const PROJECT_NEW_WORKSPACE: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.workspace.new,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'New workspace',
  defaultKeys: DEFAULT_KEYS.project.workspace.new,
  enabled: ({ sidebar }: ApplicationManager, project) => project.state === 'ok' && !sidebar.creating(project.id),
  run: ({ projects, router, sidebar }: ApplicationManager, project) => {
    sidebar.setCreating(project.id, true);
    void projects.workspaces
      .add(project.id, { type: 'new' })
      .then(
        ({ id }) => router.navigate({ href: DEFAULT_ROUTES.workspace(id.daemon, id.project, id.workspace) }),
        (error: Error) => toast.add({ type: 'error', title: 'Adding workspace failed', description: error.message }),
      )
      .finally(() => sidebar.setCreating(project.id, false));
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
    sidebar.projectDeleteDialog.openWithPayload(project.id);
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
    sidebar.workspaceDeleteDialog.openWithPayload(workspace.id);
    return true;
  },
};

export const WORKSPACE_MARK_READ: WorkspaceCommand = {
  scope: 'workspace',
  id: DEFAULT_COMMANDS.workspace.status.markRead,
  group: DEFAULT_COMMAND_GROUPS.workspace.id,
  label: 'Mark as read',
  defaultKeys: DEFAULT_KEYS.workspace.status.markRead,
  shown: ({ projects }, workspace) => projects.workspaces.status(workspace.id) === 'finished',
  enabled: ({ projects }, workspace) => projects.workspaces.status(workspace.id) === 'finished',
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
