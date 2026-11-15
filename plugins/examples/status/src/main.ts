import type {
  Application,
  Plugin,
  PluginInfo,
  WorkspaceCommand,
  WorkspaceId,
  WorkspaceStatus,
  WorkspaceStatusHandle,
} from '@elsewise/frontend-plugin';

// The agents each status sets on a workspace.
const STATUSES: readonly { readonly name: string; readonly label: string; readonly agents: WorkspaceStatus[] }[] = [
  { name: 'running', label: 'Running', agents: ['running', 'running'] },
  { name: 'partial', label: 'Partly complete', agents: ['running', 'complete'] },
  { name: 'complete', label: 'Complete', agents: ['complete', 'complete'] },
  { name: 'idle', label: 'Idle', agents: [] },
];

/**
 * Returns the plugin.
 */
export default function ({ id }: PluginInfo): Plugin {
  const agents = new Map<string, WorkspaceStatusHandle[]>();
  const key = ({ daemon, project, workspace }: WorkspaceId) => `${daemon}/${project}/${workspace}`;

  const set = ({ projects }: Application, workspace: WorkspaceId, statuses: readonly WorkspaceStatus[]) => {
    for (const handle of agents.get(key(workspace)) ?? []) {
      handle.dispose();
    }
    agents.set(
      key(workspace),
      statuses.map((status) => projects.workspaces.addStatus(workspace, status)),
    );
  };

  const commands: WorkspaceCommand[] = STATUSES.map(({ name, label, agents }) => ({
    scope: 'workspace',
    id: `${id}.${name}`,
    group: id,
    label,
    run: (application, workspace) => {
      set(application, workspace.id, agents);
      return true;
    },
  }));

  return {
    onEnable({ commands: registry, projects }) {
      return [
        registry.addGroups([{ id, label: 'Status example' }]),
        registry.add(commands),
        projects.workspaces.addContextMenu([
          { id, order: 90, items: [{ label: 'Set status', submenu: `${id}.status` }] },
          {
            id: `${id}.statuses`,
            in: `${id}.status`,
            items: commands.map((command, index) => ({ order: (index + 1) * 10, command: command.id })),
          },
        ]),
        () => {
          for (const handle of [...agents.values()].flat()) {
            handle.dispose();
          }
          agents.clear();
        },
      ];
    },
  };
}
