import { useSortable } from '@dnd-kit/react/sortable';
import { createDialogHandle, DialogTrigger } from '@elsewise/components/components/dialog';
import { Icon } from '@elsewise/components/components/icon';
import {
  SidebarMenuRowAction,
  SidebarMenuSubItem,
  SidebarMenuSubRow,
  SidebarMenuSubRowLabel,
} from '@elsewise/components/components/sidebar';
import { StatusIndicator } from '@elsewise/components/components/status-indicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { Link, useParams } from '@tanstack/react-router';
import { useId, useMemo, useState } from 'react';
import type { Workspace } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { PluginBoundary } from '@/plugins/plugin-boundary';
import { mapWorkspace, useWorkspaceSidebarItems, useWorkspaceStatus } from '@/projects/workspace-manager';
import { DeleteWorkspaceDialog } from './delete-workspace-dialog';

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
  const status = useWorkspaceStatus({ daemon: daemonId, project: projectId, workspace: workspace.id });
  const statusId = useId();
  const [deletion] = useState(() => createDialogHandle());
  const items = useWorkspaceSidebarItems();
  const pluginWorkspace = useMemo(() => mapWorkspace(daemonId, workspace), [daemonId, workspace]);
  const { ref, handleRef } = useSortable({
    id: workspace.id,
    index,
    group: projectId,
    type: 'workspace',
    data: { projectId },
    accept: (source) => source.type === 'workspace' && source.data.projectId === projectId,
  });

  return (
    <SidebarMenuSubItem ref={ref}>
      {/* TODO: Expose the row to plugin CSS, e.g. as [data-elsewise-part="workspace"] with data-active. */}
      <SidebarMenuSubRow size="sm">
        <SidebarMenuSubRowLabel
          isActive={params.daemon === daemonId && params.project === projectId && params.workspace === workspace.id}
          render={
            <Link
              aria-describedby={workspace.main ? `${statusId} ${statusId}main` : statusId}
              aria-keyshortcuts={workspace.main ? undefined : 'Delete'}
              draggable={false}
              // TODO: Bind through a command once commands have a sidebar scope.
              onKeyDown={(event) => {
                if (
                  !workspace.main &&
                  (event.key === 'Delete' || event.key === 'Backspace') &&
                  !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                ) {
                  event.preventDefault();
                  deletion.open(null);
                }
              }}
              params={{ daemon: daemonId, project: projectId, workspace: workspace.id }}
              ref={handleRef}
              to="/$daemon/$project/$workspace"
            />
          }
        >
          {/* The indicators are hidden from assistive technology, as the link refers to them for its description. */}
          <StatusIndicator aria-hidden id={statusId} status={status} />
          <span>{workspace.name}</span>
        </SidebarMenuSubRowLabel>
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
          <DeleteWorkspaceDialog daemonId={daemonId} handle={deletion} workspace={workspace}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogTrigger
                    render={
                      // Out of the tab order, as Delete on the workspace opens the dialog.
                      <SidebarMenuRowAction aria-label={`Delete ${workspace.name}`} showOnHover tabIndex={-1} />
                    }
                  />
                }
              >
                <Icon name="close" />
              </TooltipTrigger>
              <TooltipContent>Delete workspace</TooltipContent>
            </Tooltip>
          </DeleteWorkspaceDialog>
        )}
      </SidebarMenuSubRow>
    </SidebarMenuSubItem>
  );
}
