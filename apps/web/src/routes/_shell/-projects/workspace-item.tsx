import { useSortable } from '@dnd-kit/react/sortable';
import { DialogTrigger } from '@elsewise/components/components/dialog';
import { Icon } from '@elsewise/components/components/icon';
import {
  SidebarMenuSubAction,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@elsewise/components/components/sidebar';
import { StatusIndicator } from '@elsewise/components/components/status-indicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { Link, useParams } from '@tanstack/react-router';
import { useId } from 'react';
import type { Workspace } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { useWorkspaceStatus } from '@/projects/workspace-manager';
import { DeleteWorkspaceDialog } from './delete-workspace-dialog';

/**
 * A workspace of the project with `projectId`, moved among the project's workspaces by dragging it.
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
      <SidebarMenuSubButton
        className="cursor-default pr-7"
        isActive={params.daemon === daemonId && params.project === projectId && params.workspace === workspace.id}
        render={
          <Link
            aria-describedby={workspace.main ? `${statusId} ${statusId}main` : statusId}
            draggable={false}
            params={{ daemon: daemonId, project: projectId, workspace: workspace.id }}
            ref={handleRef}
            to="/$daemon/$project/$workspace"
          />
        }
        size="sm"
      >
        {/* The indicators are hidden from assistive technology, as the link refers to them for its description. */}
        <StatusIndicator aria-hidden id={statusId} status={status} />
        <span className="truncate">{workspace.name}</span>
      </SidebarMenuSubButton>
      {workspace.main ? (
        <Tooltip>
          <TooltipTrigger render={<SidebarMenuSubAction render={<span />} />}>
            <Icon aria-hidden aria-label="Main workspace" id={`${statusId}main`} name="main-workspace" role="img" />
          </TooltipTrigger>
          <TooltipContent>Main workspace</TooltipContent>
        </Tooltip>
      ) : (
        <DeleteWorkspaceDialog daemonId={daemonId} workspace={workspace}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DialogTrigger render={<SidebarMenuSubAction aria-label={`Delete ${workspace.name}`} showOnHover />} />
              }
            >
              <Icon name="close" />
            </TooltipTrigger>
            <TooltipContent>Delete workspace</TooltipContent>
          </Tooltip>
        </DeleteWorkspaceDialog>
      )}
    </SidebarMenuSubItem>
  );
}
