import {
  type CloneProgress,
  type ContextMenuGroup,
  DEFAULT_ROUTES,
  type Disposable,
  type ExistingProject,
  type NewProject,
  type Project,
  type ProjectClone,
  type ProjectIcon,
  type ProjectId,
  type ProjectSidebarItem,
  type ProjectSource,
  type ProjectSourceGroup,
  type Projects,
  type RepositoryGroup,
  type RepositorySource,
} from '@elsewise/frontend-plugin';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { ContextMenuManager } from '@/command/context-menu/context-menu-manager';
import { daemonQuery } from '@/daemon';
import { type Progress, Progress_Phase } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type { Project as ProjectMessage } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { SortedSet } from '@/plugins/sorted-set';
import { DEFAULT_PROJECT_MENU } from '@/projects/default-context-menu';
import { DEFAULT_PROJECT_SOURCES } from '@/projects/default-sources';
import { updateProjectLayout } from '@/projects/layout';
import { WorkspaceManager, workspacesQuery } from '@/projects/workspace-manager';
import { WorkspaceStateStore } from '@/projects/workspace-state-store';

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
  private readonly listeners = new Set<() => void>();
  private readonly addedIcons = new SortedSet<ProjectIcon>('Project icon', () => this.notify());
  private readonly addedSidebarItems = new SortedSet<ProjectSidebarItem>('Project sidebar item', () => this.notify());
  private readonly contextMenus = new ContextMenuManager(DEFAULT_PROJECT_MENU, () => this.notify());
  private addedSourceGroups: readonly (readonly ProjectSourceGroup[])[] = [DEFAULT_PROJECT_SOURCES];
  private currentSourceGroups: readonly ProjectSourceGroup[] = this.mergeSources(DEFAULT_PROJECT_SOURCES);
  private currentSources: readonly ProjectSource[] = this.currentSourceGroups.flatMap((group) => group.sources);
  private repositorySources: readonly (readonly RepositorySource[])[] = [];

  constructor(
    private readonly client: QueryClient,
    router: AnyRouter,
    private readonly states = new WorkspaceStateStore(undefined),
  ) {
    this.workspaces = new WorkspaceManager(client, router, states);
  }

  async list(daemonId: string): Promise<readonly Project[]> {
    const projects = await this.client.query(projectsQuery(daemonId));
    return projects.map((project) => mapProject(daemonId, project));
  }

  async add(daemonId: string, project: NewProject | ExistingProject): Promise<Project> {
    const daemon = await this.client.query(daemonQuery(daemonId));
    const { project: added } = await daemon.projects.createProject({
      source:
        project.type === 'new'
          ? { case: 'new', value: { name: project.name, absolutePath: project.absolutePath } }
          : { case: 'existing', value: { name: project.name, absolutePath: project.absolutePath } },
    });
    await this.client.invalidateQueries({ queryKey: projectsQuery(daemonId).queryKey, exact: true });
    return mapProject(daemonId, added);
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
    const { queryKey } = projectsQuery(project.daemon);
    const previous = this.client.getQueryData(queryKey);
    this.client.setQueryData(queryKey, (projects) =>
      projects?.map((other) => (other.id === project.project ? { ...other, name } : other)),
    );

    try {
      const daemon = await this.client.query(daemonQuery(project.daemon));
      const updated = await daemon.projects.updateProject({ projectId: project.project, name });
      return mapProject(project.daemon, updated.project);
    } catch (error) {
      this.client.setQueryData(queryKey, previous);
      throw error;
    } finally {
      await this.client.invalidateQueries({ queryKey, exact: true });
    }
  }

  async delete(project: ProjectId, { deleteFiles = false } = {}): Promise<void> {
    const daemon = await this.client.query(daemonQuery(project.daemon));
    await daemon.projects.deleteProject({ projectId: project.project, deleteFiles });

    await this.workspaces.close(project, DEFAULT_ROUTES.home);
    await this.states.delete(project);

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

  /**
   * The source groups, one per id, sorted by order, with their sources sorted by order.
   */
  get sourceGroups(): readonly ProjectSourceGroup[] {
    return this.currentSourceGroups;
  }

  /**
   * The sources of every group, in the groups' order.
   */
  get sources(): readonly ProjectSource[] {
    return this.currentSources;
  }

  addSources(groups: readonly ProjectSourceGroup[]): Disposable {
    const added = [...groups];
    this.addedSourceGroups = [...this.addedSourceGroups, added];
    this.currentSourceGroups = this.mergeSources(this.addedSourceGroups.flat());
    this.currentSources = this.currentSourceGroups.flatMap((group) => group.sources);
    this.notify();
    return () => {
      this.addedSourceGroups = this.addedSourceGroups.filter((other) => other !== added);
      this.currentSourceGroups = this.mergeSources(this.addedSourceGroups.flat());
      this.currentSources = this.currentSourceGroups.flatMap((group) => group.sources);
      this.notify();
    };
  }

  // Merges the groups that share an id, sorted. `order` comes from the first group that sets it, and a source whose id
  // came earlier is skipped.
  private mergeSources(groups: readonly ProjectSourceGroup[]): ProjectSourceGroup[] {
    const merged = new Map<string, { order?: number; sources: ProjectSource[] }>();
    const ids = new Set<string>();
    for (const group of groups) {
      let existing = merged.get(group.id);
      if (existing === undefined) {
        existing = { ...(group.order === undefined ? {} : { order: group.order }), sources: [] };
        merged.set(group.id, existing);
      } else if (group.order !== undefined) {
        if (existing.order === undefined) {
          existing.order = group.order;
        } else if (existing.order !== group.order) {
          console.warn(`Project source group ${group.id} already has order ${existing.order}, ignoring ${group.order}`);
        }
      }

      for (const source of group.sources) {
        if (ids.has(source.id)) {
          console.warn(`Project source ${source.id} was already added`);
          continue;
        }

        ids.add(source.id);
        existing.sources.push(source);
      }
    }

    return Array.from(merged, ([id, group]) => ({
      id,
      ...group,
      sources: group.sources.sort(
        (a, b) =>
          (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
          a.label.localeCompare(b.label),
      ),
    })).sort(
      (a, b) =>
        (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
    );
  }

  addRepositorySources(sources: readonly RepositorySource[]): Disposable {
    const added = [...sources];
    this.repositorySources = [...this.repositorySources, added];
    return () => {
      this.repositorySources = this.repositorySources.filter((other) => other !== added);
    };
  }

  /**
   * Returns the repositories that every source finds for `query`, merged by group id and in order.
   */
  async searchRepositories(query: string, options: { signal: AbortSignal }): Promise<readonly RepositoryGroup[]> {
    const found = await Promise.all(
      this.repositorySources.flat().map((source) =>
        source(query, options).catch((error: unknown) => {
          console.warn('Repository source failed', error);
          return [];
        }),
      ),
    );
    const merged = new Map<string, RepositoryGroup>();
    for (const group of found.flat()) {
      const first = merged.get(group.id);
      merged.set(group.id, {
        id: group.id,
        order: first?.order ?? group.order,
        icon: first?.icon ?? group.icon,
        label: first?.label ?? group.label,
        items: [...(first?.items ?? []), ...group.items],
      });
    }

    return [...merged.values()]
      .filter((group) => group.items.length > 0)
      .sort(
        (a, b) =>
          (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
      );
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

/**
 * Returns the groups of sources from which a project can be added.
 */
export function useProjectSourceGroups(): readonly ProjectSourceGroup[] {
  const projects = useApplicationManager().projects;
  const subscribe = useCallback((listener: () => void) => projects.subscribe(listener), [projects]);
  return useSyncExternalStore(subscribe, () => projects.sourceGroups);
}
