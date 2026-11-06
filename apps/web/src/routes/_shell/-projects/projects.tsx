import { type DragOperation, Modifier } from '@dnd-kit/abstract';
import { AutoScroller, Feedback, PointerActivationConstraints, PointerSensor, PreventSelection } from '@dnd-kit/dom';
import { isSortable } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@elsewise/components/components/dropdown-menu';
import { Icon } from '@elsewise/components/components/icon';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@elsewise/components/components/sidebar';
import { toast } from '@elsewise/components/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { DEFAULT_ROUTES } from '@elsewise/frontend-plugin';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useApplicationManager } from '@/application-context';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { useProjectLayout, useUpdateProjectLayout } from '@/projects/layout';
import { projectsQuery } from '@/projects/project-manager';
import { DeleteProjectDialog } from './delete-project-dialog';
import { DeleteWorkspaceDialog } from './delete-workspace-dialog';
import { ImportWorkspaceDialog } from './import-workspace-dialog';
import { NewProjectDialog } from './new-project-dialog';
import { NewWorkspaceDialog } from './new-workspace-dialog';
import { ProjectItem } from './project-item';

// Moves the dragged item by whole device pixels. The pointer reports fractions of a pixel, which blurs the item.
class SnapToPixels extends Modifier {
  override apply({ shape, transform }: DragOperation) {
    const ratio = window.devicePixelRatio;
    const { left = 0, top = 0 } = shape?.initial.boundingRectangle ?? {};
    return {
      x: Math.round((left + transform.x) * ratio) / ratio - left,
      y: Math.round((top + transform.y) * ratio) / ratio - top,
    };
  }
}

const MODIFIERS = [SnapToPixels];

const PLUGINS = [AutoScroller, Feedback, PreventSelection];

const SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];

/**
 * The projects on every daemon, each with its workspaces under it.
 */
export function Projects() {
  // TODO: List the remote daemons.
  const daemons = [LOCAL_DAEMON_ID];
  return (
    <>
      {daemons.map((daemonId) => (
        <DaemonGroup daemonId={daemonId} key={daemonId} />
      ))}
      <NewProjectDialog />
      <NewWorkspaceDialog />
      <ImportWorkspaceDialog />
      <DeleteProjectDialog />
      <DeleteWorkspaceDialog />
    </>
  );
}

function DaemonGroup({ daemonId }: { daemonId: string }) {
  const { platform, projects: manager, router, sidebar } = useApplicationManager();
  const projects = useQuery(projectsQuery(daemonId));
  const layout = useProjectLayout(daemonId);
  const { moveProject, moveWorkspace } = useUpdateProjectLayout(daemonId);
  const pickFolder = window.bridge?.window?.pickFolder;

  const importProject = useMutation({
    mutationFn: async (absolutePath: string) => {
      const project = await manager.add(daemonId, { type: 'existing', absolutePath });
      return (await manager.workspaces.list(project.id)).find((workspace) => workspace.main);
    },
    onSuccess: (main) => {
      if (main) {
        void router.navigate({ href: DEFAULT_ROUTES.workspace(main.id.daemon, main.id.project, main.id.workspace) });
      }
    },
    onError: (error, absolutePath) =>
      toast.add({
        type: 'error',
        title: `Could not import “${absolutePath.split('/').at(-1) ?? absolutePath}”`,
        description: error.message,
      }),
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>My workspaces</SidebarGroupLabel>
      {pickFolder && projects.isSuccess && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <SidebarGroupAction
                      aria-label="Add project"
                      className="top-3 right-2.5 w-6 text-text-3 data-popup-open:overlay-hover [&>svg]:size-3"
                    />
                  }
                />
              }
            >
              <Icon name="add" />
            </TooltipTrigger>
            <TooltipContent>Add project</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => sidebar.newProjectDialog.openWithPayload({ daemon: daemonId })}>
              New project…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={importProject.isPending}
              onClick={async () => {
                const absolutePath = await platform.pickFolder();
                if (absolutePath !== null) {
                  importProject.mutate(absolutePath);
                }
              }}
            >
              Import project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SidebarGroupContent>
        {projects.isError && <p className="px-2 text-sm text-text-3">{projects.error.message}</p>}
        <DragDropProvider
          onDragEnd={({ canceled, operation: { source } }) => {
            if (canceled || !isSortable(source) || source.index === source.initialIndex) {
              return;
            }

            if (source.type === 'project') {
              moveProject(String(source.id), source.index);
            } else {
              moveWorkspace(String(source.group), String(source.id), source.index);
            }
          }}
          modifiers={MODIFIERS}
          plugins={PLUGINS}
          sensors={SENSORS}
        >
          <SidebarMenu className="[&_[data-dnd-dragging]]:rounded-lg [&_[data-dnd-dragging]]:bg-surface! [&_[data-dnd-dragging]]:shadow-md [&_[data-dnd-dragging]>[data-sidebar=menu-row]]:overlay-hover [&_[data-dnd-dragging]>[data-sidebar=menu-sub-row]]:overlay-hover">
            {layout.projects(projects.data ?? []).map((project, index) => (
              <ProjectItem daemonId={daemonId} index={index} key={project.id} project={project} />
            ))}
          </SidebarMenu>
        </DragDropProvider>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
