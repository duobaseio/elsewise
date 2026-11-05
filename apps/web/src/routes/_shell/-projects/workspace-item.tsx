import { useSortable } from '@dnd-kit/react/sortable';
import { Icon } from '@elsewise/components/components/icon';
import {
  SidebarMenuRowAction,
  SidebarMenuSubItem,
  SidebarMenuSubRow,
  SidebarMenuSubRowLabel,
} from '@elsewise/components/components/sidebar';
import { StatusIndicator } from '@elsewise/components/components/status-indicator';
import { toast } from '@elsewise/components/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { DEFAULT_COMMANDS, type Workspace as PluginWorkspace } from '@elsewise/frontend-plugin';
import { Link, useParams } from '@tanstack/react-router';
import { useId, useMemo } from 'react';
import { useApplicationManager } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { runSidebarKeys } from '@/command/keymap/keymap';
import type { Workspace } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { PluginBoundary } from '@/plugins/plugin-boundary';
import { useRenaming } from '@/projects/sidebar-store';
import {
  mapWorkspace,
  useWorkspaceContextMenu,
  useWorkspaceSidebarItems,
  useWorkspaceStatus,
} from '@/projects/workspace-manager';
import { NameInput } from './name-input';

const UNAVAILABLE = { missing: 'Folder missing', broken: 'Not a worktree' } as const;

/**
 * A workspace of the project with `projectId`, moved among the project's workspaces by dragging it, and deleted with
 * Delete unless it is the main one.
 */
export function WorkspaceItem({
  daemonId,
  projectId,
  workspace,
  index,
}: {
  daemonId: string;
  projectId: string;
  workspace: Workspace;
  index: number;
}) {
  const params = useParams({ strict: false });
  const statusId = useId();

  const items = useWorkspaceSidebarItems();
  const menu = useWorkspaceContextMenu();
  const { commands, projects, sidebar } = useApplicationManager();

  const pluginWorkspace = useMemo(() => mapWorkspace(daemonId, workspace), [daemonId, workspace]);
  const renaming = useRenaming(pluginWorkspace.id);
  const { state } = pluginWorkspace;

  const { ref, handleRef } = useSortable({
    id: workspace.id,
    index,
    group: projectId,
    type: 'workspace',
    data: { projectId },
    accept: (source) => source.type === 'workspace' && source.data.projectId === projectId,
    disabled: renaming,
  });

  return (
    <SidebarMenuSubItem ref={ref}>
      {/* TODO: Expose the row to plugin CSS, e.g. as [data-elsewise-part="workspace"] with data-active. */}
      <CommandContextMenu
        menu={menu}
        opens={() => !renaming}
        render={<SidebarMenuSubRow size="sm" />}
        target={{ current: pluginWorkspace }}
      >
        {renaming ? (
          <SidebarMenuSubRowLabel render={<div />}>
            <WorkspaceItemIcon statusId={statusId} workspace={pluginWorkspace} />
            <NameInput
              label="Workspace name"
              name={workspace.name}
              onCancel={() => {
                sidebar.renaming = null;
              }}
              onRename={(name) => {
                sidebar.renaming = null;
                projects.workspaces
                  .rename(pluginWorkspace.id, name)
                  .catch((error: Error) =>
                    toast.add({ type: 'error', title: 'Renaming workspace failed', description: error.message }),
                  );
              }}
            />
          </SidebarMenuSubRowLabel>
        ) : (
          <SidebarMenuSubRowLabel
            isActive={params.daemon === daemonId && params.project === projectId && params.workspace === workspace.id}
            onKeyDown={(event) => runSidebarKeys(commands, pluginWorkspace, event.nativeEvent)}
            render={
              <Link
                aria-describedby={workspace.main ? `${statusId} ${statusId}main` : statusId}
                aria-keyshortcuts={workspace.main ? undefined : 'Delete'}
                draggable={false}
                params={{ daemon: daemonId, project: projectId, workspace: workspace.id }}
                ref={handleRef}
                to="/$daemon/$project/$workspace"
              />
            }
          >
            <WorkspaceItemIcon statusId={statusId} workspace={pluginWorkspace} />
            <span className={state === 'missing' || state === 'broken' ? 'text-text-3' : undefined}>
              {workspace.name}
            </span>
          </SidebarMenuSubRowLabel>
        )}
        {items.toReversed().map(({ id, component: Item }) => (
          <PluginBoundary key={id} name={`Workspace sidebar item ${id}`}>
            <Item workspace={pluginWorkspace} />
          </PluginBoundary>
        ))}
        {workspace.main ? (
          <Tooltip>
            <TooltipTrigger render={<SidebarMenuRowAction render={<span />} />}>
              <Icon aria-hidden aria-label="Main workspace" id={`${statusId}main`} name="main-workspace" role="img" />
            </TooltipTrigger>
            <TooltipContent>Main workspace</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                // Out of the tab order, as Delete on the workspace opens the dialog.
                <SidebarMenuRowAction
                  aria-label={`Delete ${workspace.name}`}
                  onClick={() => commands.run(DEFAULT_COMMANDS.workspace.edit.delete, pluginWorkspace)}
                  showOnHover
                  tabIndex={-1}
                />
              }
            >
              <Icon name="close" />
            </TooltipTrigger>
            <TooltipContent>Delete workspace</TooltipContent>
          </Tooltip>
        )}
      </CommandContextMenu>
    </SidebarMenuSubItem>
  );
}

function WorkspaceItemIcon({ workspace, statusId }: { workspace: PluginWorkspace; statusId: string }) {
  const status = useWorkspaceStatus(workspace.id);
  const { state } = workspace;

  // The icons are hidden from assistive technology, as the link refers to them for its description.
  return state === 'missing' || state === 'broken' ? (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0" />}>
        <Icon
          aria-hidden
          aria-label={UNAVAILABLE[state]}
          className="size-4 text-text-3"
          id={statusId}
          name={state}
          role="img"
        />
      </TooltipTrigger>
      <TooltipContent>{UNAVAILABLE[state]}</TooltipContent>
    </Tooltip>
  ) : (
    <StatusIndicator aria-hidden id={statusId} status={status} />
  );
}
