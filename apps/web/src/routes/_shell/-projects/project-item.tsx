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
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import type { Project as PluginProject } from '@elsewise/frontend-plugin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useId, useMemo, useRef } from 'react';
import { useApplicationManager } from '@/application-context';
import { CommandContextMenu } from '@/command/context-menu/context-menu';
import { runSidebarKeys } from '@/command/keymap/keymap';
import { daemonQuery } from '@/daemon';
import type { Project } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { PluginBoundary } from '@/plugins/plugin-boundary';
import { useProjectLayout, useUpdateProjectLayout } from '@/projects/layout';
import { mapProject, useProjectContextMenu, useProjectIcons, useProjectSidebarItems } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';
import { WorkspaceItem } from './workspace-item';

const UNAVAILABLE = { missing: 'Folder missing', broken: 'Not a git repository' } as const;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * A project, and its workspaces under it while expanded, moved among the projects by dragging its row. A missing or
 * broken project shows neither its workspaces nor its chevron.
 */
export function ProjectItem({ daemonId, project, index }: { daemonId: string; project: Project; index: number }) {
  const client = useQueryClient();
  const navigate = useNavigate();

  const layout = useProjectLayout(daemonId);
  const { setExpanded } = useUpdateProjectLayout(daemonId);
  const row = useRef<HTMLDivElement>(null);
  const items = useProjectSidebarItems();
  const menu = useProjectContextMenu();
  const { commands } = useApplicationManager();

  const workspaces = useQuery(workspacesQuery(daemonId, project.id));
  const pluginProject = useMemo(() => mapProject(daemonId, project), [daemonId, project]);
  const stateId = useId();
  const { state } = pluginProject;

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

  const available = state !== 'missing' && state !== 'broken';

  return (
    <Collapsible
      onOpenChange={(open) => setExpanded(project.id, open)}
      open={available && layout.expanded(project.id)}
      ref={ref}
      render={<SidebarMenuItem />}
    >
      {/* TODO: Expose the row to plugin CSS, e.g. as [data-elsewise-part="project"] with data-expanded. */}
      <CommandContextMenu menu={menu} target={{ current: pluginProject }}>
        <SidebarMenuRow onKeyDown={(event) => runSidebarKeys(commands, pluginProject, event.nativeEvent)} ref={row}>
          {/* TODO: Open a delete project dialog on Delete, as workspaces do. */}
          <SidebarMenuRowLabel
            aria-describedby={available ? undefined : stateId}
            render={available ? <CollapsibleTrigger /> : undefined}
          >
            <ProjectItemIcon project={pluginProject} stateId={stateId} />
            <span className={available ? undefined : 'text-text-3'}>{project.name}</span>
          </SidebarMenuRowLabel>
          {items.toReversed().map(({ id, component: Item }) => (
            <PluginBoundary key={id} name={`Project sidebar item ${id}`}>
              <Item project={pluginProject} />
            </PluginBoundary>
          ))}
          {/* An unavailable project keeps the chevron's space, so its items line up with the others'. */}
          {available ? <SidebarMenuChevron aria-hidden /> : <span className="size-5 shrink-0" />}
        </SidebarMenuRow>
      </CommandContextMenu>
      {available && (
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
      )}
    </Collapsible>
  );
}

function ProjectItemIcon({ project, stateId }: { project: PluginProject; stateId: string }) {
  const icons = useProjectIcons();
  const { state } = project;

  let icon: ReactNode = <LetterIcon letters={letterform(project.name)} tint={null} />;
  for (const { id, component: PluginIcon } of icons.toReversed()) {
    icon = (
      <PluginBoundary fallback={icon} key={id} name={`Project icon ${id}`}>
        <PluginIcon fallback={icon} project={project} />
      </PluginBoundary>
    );
  }

  if (state === 'missing' || state === 'broken') {
    icon = (
      <Tooltip>
        <TooltipTrigger render={<span className="flex" />}>
          {/* Hidden from assistive technology, as the label refers to it for its description. */}
          <Icon
            aria-hidden
            aria-label={UNAVAILABLE[state]}
            className="size-4 text-text-3"
            id={stateId}
            name={state}
            role="img"
          />
        </TooltipTrigger>
        <TooltipContent>{UNAVAILABLE[state]}</TooltipContent>
      </Tooltip>
    );
  }

  return <span className="flex size-4 shrink-0 overflow-hidden">{icon}</span>;
}

function letterform(name: string): string {
  return name
    .split(/[\s\-_.]+|(?<=\p{Ll})(?=\p{Lu})/u)
    .flatMap(
      (word) =>
        [...GRAPHEMES.segment(word)]
          .find(({ segment }) => /[\p{L}\p{N}\p{So}]/u.test(segment))
          ?.segment.toUpperCase() ?? [],
    )
    .slice(0, 2)
    .join('');
}
