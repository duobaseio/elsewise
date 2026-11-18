import type {
  ClosablePanel,
  Dock,
  EditorPanel,
  Group,
  GroupPlacement,
  Layout,
  Panel,
  Placement,
  TablessPanel,
  TabPanel,
  TerminalPanel,
  Workspace,
  WorkspaceId,
} from '@elsewise/frontend-plugin';
import type { DockviewApi, DockviewIDisposable } from 'dockview-react';
import { sameWorkspace, type WorkspaceManager } from '@/projects/workspace-manager';
import type { TerminalManager } from '@/terminals/terminal-manager';
import { DockStore } from './dock-store';
import { movePanel } from './placement';

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
    private readonly dockview: DockviewApi,
    private readonly workspaces: WorkspaceManager,
    private readonly terminals: TerminalManager,
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

  move(panel: TabPanel, placement: Placement): void;
  move(panel: TablessPanel, placement: GroupPlacement): void;
  move(panel: Panel, placement: Placement): void {
    if (movePanel(this.dockview, this.panels, panel, placement)) {
      this.update();
    }
  }

  activate(panel: Panel): void {
    const open = this.dockview.getPanel(panel.id);
    if (open === undefined) {
      return;
    }

    open.group.api.setVisible(true);
    open.api.setActive();
    this.update();
  }

  show(panel: Panel): void {
    const open = this.dockview.getPanel(panel.id);
    if (open === undefined) {
      return;
    }

    open.group.api.setVisible(true);
    open.group.model.openPanel(open, { skipSetGroupActive: true });
    this.update();
  }

  hide(panel: Panel): void {
    this.dockview.getPanel(panel.id)?.group.api.setVisible(false);
    this.update();
  }

  async close(panel: ClosablePanel): Promise<boolean> {
    const open = this.get(panel.id);
    if (open?.type === 'terminal') {
      await this.terminals.delete(open.session);
    }

    // A terminal's panel closes itself once its terminal is deleted.
    this.dockview.getPanel(panel.id)?.api.close();
    this.update();
    return true;
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
