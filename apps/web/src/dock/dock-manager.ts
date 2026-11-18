import type {
  Dock,
  EditorPanel,
  Group,
  Layout,
  Panel,
  TabPanel,
  TerminalPanel,
  Workspace,
  WorkspaceId,
} from '@elsewise/frontend-plugin';
import type { DockviewApi, DockviewIDisposable } from 'dockview-react';
import { sameWorkspace, type WorkspaceManager } from '@/projects/workspace-manager';
import { DockStore } from './dock-store';

/**
 * A workspace's dock, read from its dockview.
 */
export class DockManager implements Dock {
  private readonly disposables: DockviewIDisposable[];
  private readonly store: DockStore;
  private changed = false;
  private resolved: Workspace | null = null;

  constructor(
    readonly workspaceId: WorkspaceId,
    dockview: DockviewApi,
    private readonly workspaces: WorkspaceManager,
    onOpen: (panel: Panel) => void,
    onClose: (panel: Panel) => void,
    onChange: () => void,
  ) {
    this.store = new DockStore(workspaceId, dockview);
    this.disposables = [
      dockview.onDidAddPanel((added) => {
        this.update();
        const panel = this.get(added.id);
        if (panel !== null) {
          onOpen(panel);
        }
      }),
      dockview.onDidRemovePanel((removed) => {
        const panel = this.get(removed.id);
        this.update();
        if (panel !== null) {
          onClose(panel);
        }
      }),
      dockview.onDidMovePanel(() => this.update()),
      dockview.onDidActivePanelChange(() => this.update()),
      // Dockview reports every change as a layout change, after its other events. A resize is one too.
      //
      // TODO: Refresh as soon as a group is hidden or shown. Dockview reports that only as a layout change, which comes
      // late, so the groups are out of date until then.
      dockview.onDidLayoutChange(() => {
        this.update();
        if (this.changed) {
          this.changed = false;
          onChange();
        }
      }),
    ];
  }

  private update() {
    if (this.store.update()) {
      this.changed = true;
    }
  }

  get workspace(): Workspace {
    const active = this.workspaces.active;
    if (sameWorkspace(active?.id, this.workspaceId)) {
      this.resolved = active;
    }

    if (this.resolved === null) {
      throw new Error('The workspace of the dock is not loaded');
    }
    return this.resolved;
  }

  get activePanel(): Panel | null {
    return this.store.snapshot.activePanel;
  }

  get activeTabPanel(): TabPanel | null {
    return this.store.snapshot.activeTabPanel;
  }

  get panels(): readonly Panel[] {
    return this.store.snapshot.panels;
  }

  get groups(): readonly Group[] {
    return this.store.snapshot.groups;
  }

  get layout(): Layout | null {
    return this.store.snapshot.layout;
  }

  get(id: string): Panel | null {
    return this.panels.find((panel) => panel.id === id) ?? null;
  }

  // TODO: Implement once the dock adds its panels.
  addEditor(): EditorPanel | null {
    throw new Error('Not implemented');
  }

  // TODO: Implement once the dock adds its panels.
  addTerminal(): Promise<TerminalPanel | null> {
    throw new Error('Not implemented');
  }

  // TODO: Implement with the operations on open panels.
  move(): void {
    throw new Error('Not implemented');
  }

  // TODO: Implement with the operations on open panels.
  close(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  // TODO: Implement with the operations on open panels.
  show(): void {
    throw new Error('Not implemented');
  }

  // TODO: Implement with the operations on open panels.
  hide(): void {
    throw new Error('Not implemented');
  }

  // TODO: Implement with the operations on open panels.
  activate(): void {
    throw new Error('Not implemented');
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
