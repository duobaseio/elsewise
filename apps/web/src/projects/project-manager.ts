import { createDialogHandle } from '@elsewise/components/components/dialog';
import {
  type CloneProgress,
  type ContextMenuGroup,
  DEFAULT_ROUTES,
  type Disposable,
  type ExistingProjectSource,
  type NewProjectSource,
  type Project,
  type ProjectClone,
  type ProjectIcon,
  type ProjectId,
  type ProjectSidebarItem,
  type Projects,
} from '@elsewise/frontend-plugin';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { ContextMenuManager } from '@/command/context-menu/context-menu-manager';
import { daemonQuery } from '@/daemon';
import { type Progress, Progress_Phase } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type { Project as ProjectMessage } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { OrderedItems } from '@/plugins/ordered-items';
import { DEFAULT_PROJECT_MENU } from '@/projects/default-context-menu';
import { updateProjectLayout } from '@/projects/layout';
import { WorkspaceManager, workspacesQuery } from '@/projects/workspace-manager';

/**
 * Returns the query for every project on the daemon with `daemonId`.
 */
export function projectsQuery(daemonId: string) {
  return queryOptions({
    queryKey: ['daemons', daemonId, 'projects'],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.getProjects({})).projects;
    },
  });
}

/**
 * The projects as plugins see them.
 */
export class ProjectManager implements Projects {
  readonly workspaces: WorkspaceManager;
  readonly deleteDialog = createDialogHandle<ProjectId>();
  private readonly listeners = new Set<() => void>();
  private readonly addedIcons = new OrderedItems<ProjectIcon>('Project icon', () => this.notify());
  private readonly addedSidebarItems = new OrderedItems<ProjectSidebarItem>('Project sidebar item', () =>
    this.notify(),
  );
  private readonly contextMenus = new ContextMenuManager(DEFAULT_PROJECT_MENU, () => this.notify());

  constructor(
    private readonly client: QueryClient,
    router: AnyRouter,
  ) {
    this.workspaces = new WorkspaceManager(client, router);
  }

  async list(daemonId: string): Promise<readonly Project[]> {
    const projects = await this.client.query(projectsQuery(daemonId));
    return projects.map((project) => mapProject(daemonId, project));
  }

  async add(daemonId: string, source: NewProjectSource | ExistingProjectSource): Promise<Project> {
    const daemon = await this.client.query(daemonQuery(daemonId));
    const { project } = await daemon.projects.createProject({
      source:
        source.type === 'new'
          ? { case: 'new', value: { name: source.name, absolutePath: source.absolutePath } }
          : { case: 'existing', value: { name: source.name, absolutePath: source.absolutePath } },
    });
    await this.client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true });
    return mapProject(daemonId, project);
  }

  async clone(
    daemonId: string,
    clone: ProjectClone,
    { onProgress, signal }: { onProgress?: (progress: CloneProgress) => void; signal?: AbortSignal } = {},
  ): Promise<Project> {
    const daemon = await this.client.query(daemonQuery(daemonId));
    const request = { url: clone.url, name: clone.name, absolutePath: clone.absolutePath };
    for await (const { event } of daemon.projects.cloneProject(request, { signal })) {
      if (event.case === 'progress') {
        onProgress?.(mapProgress(event.value));
      } else if (event.case === 'project') {
        await this.client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true });
        return mapProject(daemonId, event.value);
      }
    }

    throw new Error('The clone ended without a project.');
  }

  async rename(project: ProjectId, name: string): Promise<Project> {
    const daemon = await this.client.query(daemonQuery(project.daemon));
    const updated = await daemon.projects.updateProject({ projectId: project.project, name });

    await this.client.invalidateQueries({ queryKey: projectsQuery(project.daemon).queryKey, exact: true });
    return mapProject(project.daemon, updated.project);
  }

  async delete(project: ProjectId, { deleteFiles = false } = {}): Promise<void> {
    const daemon = await this.client.query(daemonQuery(project.daemon));
    await daemon.projects.deleteProject({ projectId: project.project, deleteFiles });

    await this.workspaces.close(project, DEFAULT_ROUTES.home);

    updateProjectLayout(this.client, project.daemon).removeProject(project.project);

    this.client.removeQueries({ queryKey: workspacesQuery(project.daemon, project.project).queryKey });
    await this.client.invalidateQueries({ queryKey: projectsQuery(project.daemon).queryKey, exact: true });
  }

  /**
   * The icons that plugins added, in the order they are tried.
   */
  get icons(): readonly ProjectIcon[] {
    return this.addedIcons.items;
  }

  addIcons(icons: readonly ProjectIcon[]): Disposable {
    return this.addedIcons.add(icons);
  }

  /**
   * The sidebar items that plugins added, from right to left.
   */
  get sidebarItems(): readonly ProjectSidebarItem[] {
    return this.addedSidebarItems.items;
  }

  addSidebarItems(items: readonly ProjectSidebarItem[]): Disposable {
    return this.addedSidebarItems.add(items);
  }

  /**
   * The context menu's deduplicated groups, in order of first addition.
   */
  get contextMenu(): readonly ContextMenuGroup[] {
    return this.contextMenus.groups;
  }

  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable {
    return this.contextMenus.add(groups);
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Project listener failed', error);
      }
    }
  }
}

function mapProgress({ phase, percent }: Progress): CloneProgress {
  switch (phase) {
    case Progress_Phase.ENUMERATING:
      return { phase: 'enumerating', percent };
    case Progress_Phase.COUNTING:
      return { phase: 'counting', percent };
    case Progress_Phase.COMPRESSING:
      return { phase: 'compressing', percent };
    case Progress_Phase.RECEIVING:
      return { phase: 'receiving', percent };
    case Progress_Phase.RESOLVING:
      return { phase: 'resolving', percent };
    case Progress_Phase.UNPACKING:
      return { phase: 'unpacking', percent };
    case Progress_Phase.CHECKING_OUT:
      return { phase: 'checking-out', percent };
    default:
      return { phase: 'other', percent };
  }
}

export function mapProject(daemon: string, message: ProjectMessage | undefined): Project {
  if (message === undefined) {
    throw new Error('The daemon sent no project.');
  }

  return {
    id: { daemon, project: message.id },
    name: message.name,
    state: message.state.case ?? 'broken',
    absolutePath: message.absolutePath,
  };
}

/**
 * Returns the icons that plugins added to the projects, in the order they are tried.
 */
export function useProjectIcons(): readonly ProjectIcon[] {
  const projects = useApplicationManager().projects;
  const subscribe = useCallback((listener: () => void) => projects.subscribe(listener), [projects]);
  return useSyncExternalStore(subscribe, () => projects.icons);
}

/**
 * Returns the sidebar items that plugins added to the projects, from right to left.
 */
export function useProjectSidebarItems(): readonly ProjectSidebarItem[] {
  const projects = useApplicationManager().projects;
  const subscribe = useCallback((listener: () => void) => projects.subscribe(listener), [projects]);
  return useSyncExternalStore(subscribe, () => projects.sidebarItems);
}

/**
 * Returns the groups of the projects' context menu.
 */
export function useProjectContextMenu(): readonly ContextMenuGroup[] {
  const projects = useApplicationManager().projects;
  const subscribe = useCallback((listener: () => void) => projects.subscribe(listener), [projects]);
  return useSyncExternalStore(subscribe, () => projects.contextMenu);
}
