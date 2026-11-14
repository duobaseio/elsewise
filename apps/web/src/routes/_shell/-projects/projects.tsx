import { type DragOperation, Modifier } from '@dnd-kit/abstract';
import { AutoScroller, Feedback, PointerActivationConstraints, PointerSensor, PreventSelection } from '@dnd-kit/dom';
import { isSortable } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { DEFAULT_ROUTES, type Project, type ProjectSource } from '@elsewise/frontend-plugin';
import { useMutation, useMutationState, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useApplicationManager } from '@/application-context';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { useProjectLayout, useUpdateProjectLayout } from '@/projects/layout';
import { projectsQuery, useProjectSourceGroups } from '@/projects/project-manager';
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
  const dropFromPlatform = usePlatformDrop();
  const [dropping, setDropping] = useState(false);
  return (
    <>
      {/* Folders dropped from outside are imported as projects. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the drag handlers only import dropped folders. */}
      <div
        className="relative flex flex-1 flex-col data-drop-target:after:pointer-events-none data-drop-target:after:absolute data-drop-target:after:inset-0 data-drop-target:after:bg-layer-selected"
        data-drop-target={dropping || undefined}
        onDragOver={(event) => {
          if (dropFromPlatform === undefined || !event.dataTransfer.types.includes('Files')) {
            setDropping(false);
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = 'link';
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
            setDropping(false);
          }
        }}
        onDrop={(event) => {
          if (dropFromPlatform !== undefined && event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            dropFromPlatform(event.dataTransfer);
          }
          setDropping(false);
        }}
      >
        {daemons.map((daemonId) => (
          <DaemonGroup daemonId={daemonId} key={daemonId} />
        ))}
      </div>
      <NewProjectDialog />
      <NewWorkspaceDialog />
      <ImportWorkspaceDialog />
      <DeleteProjectDialog />
      <DeleteWorkspaceDialog />
    </>
  );
}

function DaemonGroup({ daemonId }: { daemonId: string }) {
  const application = useApplicationManager();
  const projects = useQuery(projectsQuery(daemonId));
  const layout = useProjectLayout(daemonId);
  const { moveProject, moveWorkspace } = useUpdateProjectLayout(daemonId);

  const sourceGroups = useProjectSourceGroups();
  const addKey = ['daemons', daemonId, 'projects', 'add'];
  const add = useMutation({
    mutationKey: addKey,
    mutationFn: async (source: ProjectSource) => {
      const project = await source.add(application, daemonId);
      return project === null
        ? undefined
        : (await application.projects.workspaces.list(project.id)).find((workspace) => workspace.main);
    },
    onSuccess: (main) => {
      if (main !== undefined) {
        void application.router.navigate({
          href: DEFAULT_ROUTES.workspace(main.id.daemon, main.id.project, main.id.workspace),
        });
      }
    },
    onError: (error, source) => console.error(`Project source ${source.id} failed`, error),
  });
  const adding = useMutationState({
    filters: { mutationKey: addKey, status: 'pending' },
    select: (mutation) => mutation.state.variables,
  });

  const groups = sourceGroups
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) => source.shown?.(application, daemonId) !== false),
    }))
    .filter((group) => group.sources.length > 0);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>My workspaces</SidebarGroupLabel>
      {projects.isSuccess && groups.length > 0 && (
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
            {groups.map((group, i) => (
              <Fragment key={group.id}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  {group.sources.map((source) => (
                    <DropdownMenuItem
                      key={source.id}
                      disabled={adding.includes(source) || source.enabled?.(application, daemonId) === false}
                      onClick={() => add.mutate(source)}
                    >
                      {source.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </Fragment>
            ))}
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

function usePlatformDrop() {
  const { projects, router } = useApplicationManager();
  const absolutePathOf = window.bridge?.window?.absolutePathOf;
  if (absolutePathOf === undefined) {
    return undefined;
  }

  return async (transfer: DataTransfer) => {
    // The files are only readable while the drop is dispatched.
    const absolutePaths = [...transfer.files].map((file) => absolutePathOf(file)).filter((path) => path !== '');

    let first: Project | undefined;
    for (const absolutePath of absolutePaths) {
      try {
        const project = await projects.add(LOCAL_DAEMON_ID, { type: 'existing', absolutePath });
        first ??= project;
      } catch (error) {
        toast.add({
          type: 'error',
          title: `Could not import “${absolutePath.split('/').at(-1) ?? absolutePath}”`,
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const main = first && (await projects.workspaces.list(first.id)).find((workspace) => workspace.main);
    if (main !== undefined) {
      void router.navigate({ href: DEFAULT_ROUTES.workspace(main.id.daemon, main.id.project, main.id.workspace) });
    }
  };
}
