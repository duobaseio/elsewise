import {
  DEFAULT_ROUTES,
  type Disposable,
  type ProjectId,
  type Workspace,
  type WorkspaceId,
  type WorkspaceSource,
  type WorkspaceStatus,
  type WorkspaceStatusHandle,
  type Workspaces,
} from '@elsewise/frontend-plugin';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import { daemonQuery } from '@/daemon';
import type { Workspace as WorkspaceMessage } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { updateProjectLayout } from '@/projects/layout';

/**
 * Returns the query for the workspaces of the project with `projectId` on the daemon with `daemonId`, the main one
 * first.
 */
export function workspacesQuery(daemonId: string, projectId: string) {
  return queryOptions({
    queryKey: ['daemons', daemonId, 'projects', projectId, 'workspaces'],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(daemonId));
      return (await daemon.projects.getWorkspaces({ projectId })).workspaces;
    },
  });
}

// A status added to a workspace.
interface StatusEntry {
  readonly workspace: WorkspaceId;
  // A finish is idle once the workspace is shown.
  status: WorkspaceStatus;
}

/**
 * The workspaces as plugins see them.
 */
export class WorkspaceManager implements Workspaces {
  private readonly listeners = new Set<() => void>();
  private readonly activeListeners = new Set<(workspace: Workspace | null) => void>();
  private readonly statuses = new Set<StatusEntry>();
  private shown: WorkspaceId | null = null;
  private lastActive: Workspace | null = null;
  private routing = 0;

  constructor(
    private readonly client: QueryClient,
    private readonly router: AnyRouter,
  ) {
    router.subscribe('onResolved', () => void this.onNavigate());
    client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated') {
        this.notifyActive();
      }
    });
    void this.onNavigate();
  }

  // Shows the workspace in the URL once its project's workspaces load.
  private async onNavigate() {
    const id = routed(this.router);

    // Navigating back to shown workspace cancels currently loading navigation.
    const routing = ++this.routing;
    if (id === null ? this.shown === null : shown(this.shown, id)) {
      return;
    }

    if (id) {
      await this.client
        .query({ ...workspacesQuery(id.daemon, id.project), staleTime: 'static' })
        .catch(() => undefined);
    }

    if (routing !== this.routing) {
      return;
    }

    this.shown = id;
    for (const entry of this.statuses) {
      if (id && contains(id, entry.workspace) && entry.status === 'finished') {
        entry.status = 'idle';
      }
    }

    this.notify();
    this.notifyActive();
  }

  get active(): Workspace | null {
    const shown = this.shown;
    const message = shown
      ? this.client
          .getQueryData(workspacesQuery(shown.daemon, shown.project).queryKey)
          ?.find((workspace) => workspace.id === shown.workspace)
      : undefined;

    return shown && message ? mapWorkspace(shown.daemon, message) : null;
  }

  async list(project: ProjectId): Promise<readonly Workspace[]> {
    const workspaces = await this.client.query(workspacesQuery(project.daemon, project.project));
    return workspaces.map((workspace) => mapWorkspace(project.daemon, workspace));
  }

  async add(project: ProjectId, source: WorkspaceSource): Promise<Workspace> {
    const daemon = await this.client.query(daemonQuery(project.daemon));
    const { workspace } = await daemon.projects.createWorkspace({
      projectId: project.project,
      source:
        source.type === 'new'
          ? { case: 'new', value: { name: source.name, branch: source.branch, base: source.base } }
          : { case: 'existing', value: { name: source.name, absolutePath: source.absolutePath } },
    });

    await this.client.invalidateQueries(workspacesQuery(project.daemon, project.project));
    return mapWorkspace(project.daemon, workspace);
  }

  async rename(workspace: WorkspaceId, name: string): Promise<Workspace> {
    const daemon = await this.client.query(daemonQuery(workspace.daemon));
    const updated = await daemon.projects.updateWorkspace({
      projectId: workspace.project,
      workspaceId: workspace.workspace,
      name,
    });

    await this.client.invalidateQueries(workspacesQuery(workspace.daemon, workspace.project));
    return mapWorkspace(workspace.daemon, updated.workspace);
  }

  async delete(workspace: WorkspaceId, { deleteFiles = false, deleteBranch = false } = {}): Promise<void> {
    const workspaces = await this.client.query({
      ...workspacesQuery(workspace.daemon, workspace.project),
      staleTime: 'static',
    });
    const main = workspaces.find((other) => other.main);
    if (main?.id === workspace.workspace) {
      throw new Error('The main workspace cannot be deleted.');
    }

    if (deleteBranch && !deleteFiles) {
      throw new Error('Deleting the branch requires deleting the files.');
    }

    const daemon = await this.client.query(daemonQuery(workspace.daemon));
    await daemon.projects.deleteWorkspace({
      projectId: workspace.project,
      workspaceId: workspace.workspace,
      deleteFiles,
      deleteBranch,
    });

    await this.close(
      workspace,
      main ? DEFAULT_ROUTES.workspace(workspace.daemon, workspace.project, main.id) : DEFAULT_ROUTES.home,
    );

    updateProjectLayout(this.client, workspace.daemon).removeWorkspace(workspace.project, workspace.workspace);

    await this.client.invalidateQueries(workspacesQuery(workspace.daemon, workspace.project));
  }

  status(workspace: WorkspaceId): WorkspaceStatus {
    let running = false;
    let finished = false;
    for (const entry of this.statuses) {
      if (!contains(workspace, entry.workspace)) {
        continue;
      }

      if (entry.status === 'waiting') {
        return 'waiting';
      }

      running ||= entry.status === 'running';
      finished ||= entry.status === 'finished';
    }

    return running ? 'running' : finished ? 'finished' : 'idle';
  }

  addStatus(workspace: WorkspaceId, status: WorkspaceStatus): WorkspaceStatusHandle {
    const entry: StatusEntry = {
      workspace,
      status: status === 'finished' && shown(this.shown, workspace) ? 'idle' : status,
    };
    this.statuses.add(entry);
    this.notify();

    return {
      set: (status) => {
        const next = status === 'finished' && shown(this.shown, workspace) ? 'idle' : status;
        if (this.statuses.has(entry) && entry.status !== next) {
          entry.status = next;
          this.notify();
        }
      },
      dispose: () => {
        if (this.statuses.delete(entry)) {
          this.notify();
        }
      },
    };
  }

  /**
   * Leaves for `to` if the workspace shown is `id`'s, and removes the statuses of `id`'s workspaces.
   */
  async close(id: ProjectId | WorkspaceId, to: string): Promise<void> {
    // Checks the URL, since `shown` only updates once the workspaces load.
    const workspace = routed(this.router);
    if (workspace && contains(id, workspace)) {
      await this.router.navigate({ to });
    }

    let removed = false;
    for (const entry of this.statuses) {
      if (contains(id, entry.workspace)) {
        this.statuses.delete(entry);
        removed = true;
      }
    }
    if (removed) {
      this.notify();
    }
  }

  /**
   * Calls `listener` with the workspace shown when another is shown or it changes.
   */
  onActiveChange(listener: (workspace: Workspace | null) => void): Disposable {
    this.activeListeners.add(listener);
    return () => {
      this.activeListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` when a workspace's status changes.
   */
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
        console.error('Workspace listener failed', error);
      }
    }
  }

  private notifyActive() {
    const active = this.active;
    if (same(active, this.lastActive)) {
      return;
    }

    this.lastActive = active;
    for (const listener of this.activeListeners) {
      try {
        listener(active);
      } catch (error) {
        console.error('Active workspace listener failed', error);
      }
    }
  }
}

// Returns the workspace in the URL.
function routed(router: AnyRouter): WorkspaceId | null {
  const params: Record<string, unknown> = router.state.matches.at(-1)?.params ?? {};
  const { daemon, project, workspace } = params;
  return typeof daemon === 'string' && typeof project === 'string' && typeof workspace === 'string'
    ? { daemon, project, workspace }
    : null;
}

function same(a: Workspace | null, b: Workspace | null) {
  return a === null || b === null
    ? a === b
    : contains(a.id, b.id) &&
        a.name === b.name &&
        a.state === b.state &&
        a.main === b.main &&
        a.absolutePath === b.absolutePath;
}

function shown(shown: WorkspaceId | null, workspace: WorkspaceId) {
  return shown !== null && contains(workspace, shown);
}

function contains(id: ProjectId | WorkspaceId, workspace: WorkspaceId) {
  return (
    id.daemon === workspace.daemon &&
    id.project === workspace.project &&
    (!('workspace' in id) || id.workspace === workspace.workspace)
  );
}

function mapWorkspace(daemon: string, message: WorkspaceMessage | undefined): Workspace {
  if (message === undefined) {
    throw new Error('The daemon sent no workspace.');
  }

  return {
    id: { daemon, project: message.projectId, workspace: message.id },
    name: message.name,
    state: message.state.case ?? 'broken',
    main: message.main,
    absolutePath: message.absolutePath,
  };
}

/**
 * Returns the status of `workspace`.
 */
export function useWorkspaceStatus(workspace: WorkspaceId): WorkspaceStatus {
  const workspaces = useApplicationManager().projects.workspaces;
  const subscribe = useCallback((listener: () => void) => workspaces.subscribe(listener), [workspaces]);
  return useSyncExternalStore(subscribe, () => workspaces.status(workspace));
}
