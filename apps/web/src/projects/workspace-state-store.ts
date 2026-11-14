import { DEFAULT_WORKSPACE_STATE, type WorkspaceState, type WorkspacesBridge } from '@elsewise/bridge';
import type { ProjectId, WorkspaceId } from '@elsewise/frontend-plugin';
import { createContext, use, useContext } from 'react';

const SAVE_DELAY = 500;

/**
 * The state of each workspace's window, loaded once per workspace and saved shortly after it changes.
 */
export class WorkspaceStateStore {
  private readonly states = new Map<string, WorkspaceState>();
  private readonly loads = new Map<string, Promise<WorkspaceState>>();
  private readonly saves = new Map<string, { workspace: WorkspaceId; timeout: ReturnType<typeof setTimeout> }>();
  private readonly deleted: (ProjectId | WorkspaceId)[] = [];

  constructor(private readonly bridge: WorkspacesBridge | undefined) {}

  get(workspace: WorkspaceId): WorkspaceState | undefined {
    return this.states.get(this.key(workspace));
  }

  /**
   * Loads the state of `workspace`, returning the same promise each time.
   */
  load(workspace: WorkspaceId): Promise<WorkspaceState> {
    const key = this.key(workspace);
    let load = this.loads.get(key);
    if (load === undefined) {
      load = (this.bridge?.load(workspace) ?? Promise.resolve(DEFAULT_WORKSPACE_STATE))
        .catch((error: unknown) => {
          console.error('Loading the workspace state failed', error);
          return DEFAULT_WORKSPACE_STATE;
        })
        .then((loaded) => {
          const state = this.states.get(key) ?? loaded;
          this.states.set(key, state);
          return state;
        });
      this.loads.set(key, load);
    }
    return load;
  }

  /**
   * Replaces the parts of the state of `workspace` in `state`, and saves it shortly after.
   */
  update(workspace: WorkspaceId, state: Partial<WorkspaceState>): void {
    const key = this.key(workspace);
    if (this.deleted.some((id) => this.contains(id, key))) {
      return;
    }

    this.states.set(key, { ...(this.states.get(key) ?? DEFAULT_WORKSPACE_STATE), ...state });
    if (this.bridge === undefined) {
      return;
    }

    clearTimeout(this.saves.get(key)?.timeout);
    this.saves.set(key, { workspace, timeout: setTimeout(() => void this.save(key), SAVE_DELAY) });
  }

  async flush(): Promise<void> {
    await Promise.all([...this.saves.keys()].map((key) => this.save(key)));
  }

  private async save(key: string): Promise<void> {
    const pending = this.saves.get(key);
    const state = this.states.get(key);
    if (pending === undefined || state === undefined) {
      return;
    }

    clearTimeout(pending.timeout);
    this.saves.delete(key);
    try {
      await this.bridge?.save(pending.workspace, state);
    } catch (error) {
      console.error('Saving the workspace state failed', error);
    }
  }

  /**
   * Deletes the state of `id`, a workspace, or of every workspace in `id`, a project, and ignores later updates to it.
   */
  async delete(id: ProjectId | WorkspaceId): Promise<void> {
    this.deleted.push(id);
    for (const key of [...this.states.keys(), ...this.loads.keys(), ...this.saves.keys()]) {
      if (this.contains(id, key)) {
        clearTimeout(this.saves.get(key)?.timeout);
        this.saves.delete(key);
        this.loads.delete(key);
        this.states.delete(key);
      }
    }

    try {
      await this.bridge?.delete(id);
    } catch (error) {
      console.error('Deleting the workspace state failed', error);
    }
  }

  private contains(id: ProjectId | WorkspaceId, key: string): boolean {
    return 'workspace' in id
      ? key === this.key(id)
      : key.startsWith(`${JSON.stringify([id.daemon, id.project]).slice(0, -1)},`);
  }

  private key(workspace: WorkspaceId): string {
    return JSON.stringify([workspace.daemon, workspace.project, workspace.workspace]);
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
