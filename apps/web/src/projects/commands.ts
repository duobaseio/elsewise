import { toast } from '@elsewise/components/components/toast';
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  DEFAULT_ROUTES,
  type ProjectCommand,
  type WorkspaceCommand,
} from '@elsewise/frontend-plugin';

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

export const PROJECT_NEW_WORKSPACE: ProjectCommand = {
  scope: 'project',
  id: DEFAULT_COMMANDS.project.workspace.new,
  group: DEFAULT_COMMAND_GROUPS.project.id,
  label: 'New workspace',
  defaultKeys: DEFAULT_KEYS.project.workspace.new,
  enabled: (_, project) => project.state === 'ok',
  run: ({ projects, router }, project) => {
    void projects.workspaces.add(project.id, { type: 'new' }).then(
      ({ id }) => router.navigate({ to: DEFAULT_ROUTES.workspace(id.daemon, id.project, id.workspace) }),
      (error: Error) => toast.add({ type: 'error', title: 'Adding workspace failed', description: error.message }),
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
