import { DEFAULT_WORKSPACE_STATE, type WorkspaceState, type WorkspacesBridge } from '@elsewise/bridge';
import type { ProjectId, WorkspaceId } from '@elsewise/frontend-plugin';
import { createContext, use, useContext } from 'react';
import { KeyedMap } from '@/collections/keyed-map';

const SAVE_DELAY = 500;

function keyOf(workspace: WorkspaceId): readonly unknown[] {
  return [workspace.daemon, workspace.project, workspace.workspace];
}

/**
 * The state of each workspace's window, loaded once per workspace and saved shortly after it changes.
 */
export class WorkspaceStateStore {
  private readonly states = new KeyedMap<WorkspaceId, WorkspaceState>(keyOf);
  private readonly loads = new KeyedMap<WorkspaceId, Promise<WorkspaceState>>(keyOf);
  private readonly saves = new KeyedMap<WorkspaceId, ReturnType<typeof setTimeout>>(keyOf);
  private readonly deleted: (ProjectId | WorkspaceId)[] = [];

  constructor(private readonly bridge: WorkspacesBridge | undefined) {}

  get(workspace: WorkspaceId): WorkspaceState | undefined {
    return this.states.get(workspace);
  }

  /**
   * Loads the state of `workspace`, returning the same promise each time.
   */
  load(workspace: WorkspaceId): Promise<WorkspaceState> {
    let load = this.loads.get(workspace);
    if (load === undefined) {
      load = (this.bridge?.load(workspace) ?? Promise.resolve(DEFAULT_WORKSPACE_STATE))
        .catch((error: unknown) => {
          console.error('Loading the workspace state failed', error);
          return DEFAULT_WORKSPACE_STATE;
        })
        .then((loaded) => {
          const state = this.states.get(workspace) ?? loaded;
          this.states.set(workspace, state);
          return state;
        });
      this.loads.set(workspace, load);
    }
    return load;
  }

  /**
   * Replaces the parts of the state of `workspace` in `state`, and saves it shortly after.
   */
  update(workspace: WorkspaceId, state: Partial<WorkspaceState>): void {
    if (this.deleted.some((id) => this.contains(id, workspace))) {
      return;
    }

    this.states.set(workspace, { ...(this.states.get(workspace) ?? DEFAULT_WORKSPACE_STATE), ...state });
    if (this.bridge === undefined) {
      return;
    }

    clearTimeout(this.saves.get(workspace));
    this.saves.set(
      workspace,
      setTimeout(() => void this.save(workspace), SAVE_DELAY),
    );
  }

  async flush(): Promise<void> {
    await Promise.all([...this.saves.keys()].map((workspace) => this.save(workspace)));
  }

  private async save(workspace: WorkspaceId): Promise<void> {
    const timeout = this.saves.get(workspace);
    const state = this.states.get(workspace);
    if (timeout === undefined || state === undefined) {
      return;
    }

    clearTimeout(timeout);
    this.saves.delete(workspace);
    try {
      await this.bridge?.save(workspace, state);
    } catch (error) {
      console.error('Saving the workspace state failed', error);
    }
  }

  /**
   * Deletes the state of `id`, a workspace, or of every workspace in `id`, a project, and ignores later updates to it.
   */
  async delete(id: ProjectId | WorkspaceId): Promise<void> {
    this.deleted.push(id);
    for (const workspace of [...this.states.keys(), ...this.loads.keys(), ...this.saves.keys()]) {
      if (this.contains(id, workspace)) {
        clearTimeout(this.saves.get(workspace));
        this.saves.delete(workspace);
        this.loads.delete(workspace);
        this.states.delete(workspace);
      }
    }

    try {
      await this.bridge?.delete(id);
    } catch (error) {
      console.error('Deleting the workspace state failed', error);
    }
  }

  private contains(id: ProjectId | WorkspaceId, workspace: WorkspaceId): boolean {
    return (
      id.daemon === workspace.daemon &&
      id.project === workspace.project &&
      (!('workspace' in id) || id.workspace === workspace.workspace)
    );
  }
}

export const WorkspaceStateStoreContext = createContext<WorkspaceStateStore | null>(null);

/**
 * Returns the state of `workspace`, suspending until it has loaded.
 */
export function useWorkspaceState(workspace: WorkspaceId): WorkspaceState {
  const store = useWorkspaceStateStore();
  return store.get(workspace) ?? use(store.load(workspace));
}

export function useWorkspaceStateStore(): WorkspaceStateStore {
  const store = useContext(WorkspaceStateStoreContext);
  if (store === null) {
    throw new Error('Missing WorkspaceStateStoreContext');
  }
  return store;
}
