import type { Disposable, Dock, Docks, Panel, WorkspaceId } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { sameWorkspace, type WorkspaceManager } from '@/projects/workspace-manager';
import type { TerminalManager } from '@/terminals/terminal-manager';
import { DockManager } from './dock-manager';

/**
 * The docks, of which only the shown workspace's exists.
 */
export class DocksManager implements Docks {
  active: DockManager | null = null;
  private readonly openListeners = new Set<(dock: Dock, panel: Panel) => void>();
  private readonly closeListeners = new Set<(dock: Dock, panel: Panel) => void>();
  private readonly changeListeners = new Set<(dock: Dock | null) => void>();
  private attached: DockManager | null = null;

  constructor(
    private readonly workspaces: WorkspaceManager,
    private readonly terminals: TerminalManager,
  ) {
    workspaces.onActiveChange(() => this.update());
  }

  /**
   * Attaches the dockview that shows `workspace`.
   *
   * Returns its dock, which is not active until the workspace is.
   */
  attach(workspace: WorkspaceId, view: DockviewApi): DockManager {
    this.attached?.dispose();
    const dock = new DockManager(
      workspace,
      view,
      this.workspaces,
      this.terminals,
      (panel) => {
        if (this.active === dock) {
          this.call(this.openListeners, dock, panel);
        }
      },
      (panel) => {
        if (this.active === dock) {
          this.call(this.closeListeners, dock, panel);
        }
      },
      () => {
        if (this.active === dock) {
          this.call(this.changeListeners, dock);
        }
      },
    );
    this.attached = dock;
    this.update();
    return dock;
  }

  detach(dock: DockManager) {
    dock.dispose();
    if (this.attached === dock) {
      this.attached = null;
      this.update();
    }
  }

  // There is a slight gap between when the dock manager is attached and workspaces.active is updated.
  private update() {
    const dock = sameWorkspace(this.workspaces.active?.id, this.attached?.workspaceId) ? this.attached : null;
    if (this.active !== dock) {
      this.active = dock;
      this.call(this.changeListeners, dock);
    }
  }

  private call<T extends unknown[]>(listeners: Set<(...parameters: T) => void>, ...parameters: T) {
    for (const listener of listeners) {
      try {
        listener(...parameters);
      } catch (error) {
        console.error('Dock listener failed', error);
      }
    }
  }

  /**
   * Calls `listener` with each panel that opens, and its dock.
   */
  onPanelOpen(listener: (dock: Dock, panel: Panel) => void): Disposable {
    this.openListeners.add(listener);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with each panel that closes, and its dock.
   */
  onPanelClose(listener: (dock: Dock, panel: Panel) => void): Disposable {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /**
   * Calls `listener` with the active dock when another becomes active or it changes.
   */
  onChange(listener: (dock: Dock | null) => void): Disposable {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }
}
