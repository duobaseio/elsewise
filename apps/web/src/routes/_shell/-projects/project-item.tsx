import { pointerIntersection } from '@dnd-kit/collision';
import { useSortable } from '@dnd-kit/react/sortable';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@elsewise/components/components/collapsible';
import { Icon } from '@elsewise/components/components/icon';
import { LetterIcon } from '@elsewise/components/components/letter-icon';
import {
  SidebarMenuChevron,
  SidebarMenuItem,
  SidebarMenuRow,
  SidebarMenuRowLabel,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@elsewise/components/components/sidebar';
import { toast } from '@elsewise/components/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useMemo, useRef } from 'react';
import { daemonQuery } from '@/daemon';
import type { Project } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { PluginBoundary } from '@/plugins/plugin-boundary';
import { useProjectLayout, useUpdateProjectLayout } from '@/projects/layout';
import { mapProject, useProjectIcons, useProjectSidebarItems } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';
import { WorkspaceItem } from './workspace-item';

/**
 * A project, and its workspaces under it while expanded, moved among the projects by dragging its row.
 */
export function ProjectItem({ daemonId, project, index }: { daemonId: string; project: Project; index: number }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const layout = useProjectLayout(daemonId);
  const { setExpanded } = useUpdateProjectLayout(daemonId);
  const workspaces = useQuery(workspacesQuery(daemonId, project.id));
  const row = useRef<HTMLDivElement>(null);
  const icons = useProjectIcons();
  const items = useProjectSidebarItems();
  const pluginProject = useMemo(() => mapProject(daemonId, project), [daemonId, project]);

  // Only the row is a target. With the whole project, one dragged past a taller one swaps back and forth.
  const { ref } = useSortable({
    id: project.id,
    index,
    type: 'project',
    accept: 'project',
    handle: row,
    target: row,
    collisionDetector: pointerIntersection,
  });

  const addWorkspace = useMutation({
    mutationFn: async () => {
      const daemon = await client.query(daemonQuery(daemonId));
      return daemon.projects.createWorkspace({ projectId: project.id, source: { case: 'new', value: {} } });
    },
    onSuccess: async ({ workspace }) => {
      await client.invalidateQueries(workspacesQuery(daemonId, project.id));
      if (workspace) {
        void navigate({
          to: '/$daemon/$project/$workspace',
          params: { daemon: daemonId, project: project.id, workspace: workspace.id },
        });
      }
    },
    onError: (error) => toast.add({ type: 'error', title: 'Adding workspace failed', description: error.message }),
  });

  let icon: ReactNode = <LetterIcon letters={project.name.charAt(0).toUpperCase()} tint={null} />;
  for (const { id, component: ProjectIcon } of icons.toReversed()) {
    icon = (
      <PluginBoundary fallback={icon} name={`Project icon ${id}`}>
        <ProjectIcon fallback={icon} project={pluginProject} />
      </PluginBoundary>
    );
  }

  return (
    <Collapsible
      onOpenChange={(open) => setExpanded(project.id, open)}
      open={layout.expanded(project.id)}
      ref={ref}
      render={<SidebarMenuItem />}
    >
      {/* TODO: Expose the row to plugin CSS, e.g. as [data-elsewise-part="project"] with data-expanded. */}
      <SidebarMenuRow ref={row}>
        {/* TODO: Open a delete project dialog on Delete, as workspaces do. */}
        <SidebarMenuRowLabel render={<CollapsibleTrigger />}>
          <span className="flex size-4 shrink-0 overflow-hidden">{icon}</span>
          <span>{project.name}</span>
        </SidebarMenuRowLabel>
        {items.toReversed().map(({ id, component: Item }) => (
          <PluginBoundary key={id} name={`Project sidebar item ${id}`}>
            <Item project={pluginProject} />
          </PluginBoundary>
        ))}
        <SidebarMenuChevron aria-hidden />
      </SidebarMenuRow>
      <CollapsibleContent>
        <SidebarMenuSub>
          {layout.workspaces(project.id, workspaces.data ?? []).map((workspace, index) => (
            <WorkspaceItem
              daemonId={daemonId}
              index={index}
              key={workspace.id}
              projectId={project.id}
              workspace={workspace}
            />
          ))}
          <SidebarMenuSubItem>
            <SidebarMenuSubButton
              aria-label={`New workspace in ${project.name}`}
              className="w-full cursor-default text-text-2 [&>svg]:size-4 [&>svg]:p-[2.5px]"
              onClick={() => addWorkspace.mutate()}
              render={<button disabled={addWorkspace.isPending} type="button" />}
              size="sm"
            >
              <Icon name="add" />
              <span>New workspace</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
