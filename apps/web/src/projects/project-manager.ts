import {
  type CloneProgress,
  DEFAULT_ROUTES,
  type ExistingProjectSource,
  type NewProjectSource,
  type Project,
  type ProjectClone,
  type ProjectId,
  type Projects,
} from '@elsewise/frontend-plugin';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import { daemonQuery } from '@/daemon';
import { type Progress, Progress_Phase } from '@/gen/elsewise/daemon/git/v1/git_pb';
import type { Project as ProjectMessage } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
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

function mapProject(daemon: string, message: ProjectMessage | undefined): Project {
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
