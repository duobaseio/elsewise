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
  TerminalOptions,
  TerminalPanel,
  Workspace,
  WorkspaceId,
} from '@elsewise/frontend-plugin';
import type { DockviewApi, DockviewIDisposable } from 'dockview-react';
import { sameWorkspace, type WorkspaceManager } from '@/projects/workspace-manager';
import type { TerminalManager } from '@/terminals/terminal-manager';
import { DockStore } from './dock-store';
import { addPanel, movePanel } from './placement';

/**
 * A workspace's dock, read from its dockview.
 */
export class DockManager implements Dock {
  private readonly disposables: DockviewIDisposable[];
  private readonly store: DockStore;
  private changed = false;
  private disposed = false;
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

  addEditor(relativePath: string, placement: Placement, activate = true): EditorPanel | null {
    let panel = this.panels.find((open) => open.type === 'editor' && open.relativePath === relativePath) ?? null;
    if (panel === null) {
      const added = addPanel(
        this.dockview,
        this.panels,
        {
          id: `editor:${crypto.randomUUID()}`,
          component: 'editor',
          title: relativePath.split('/').at(-1),
          params: { path: relativePath },
          inactive: true,
          minimumWidth: 10,
          minimumHeight: 10,
        },
        placement,
      );
      panel = added && this.get(added.id);
    }

    if (panel?.type !== 'editor') {
      return null;
    }

    if (activate) {
      this.activate(panel);
    } else {
      this.show(panel);
    }
    return panel;
  }

  async addTerminal(options: TerminalOptions, placement: Placement, activate = true): Promise<TerminalPanel | null> {
    const reference = 'edge' in placement ? null : 'of' in placement ? placement.of : placement.with;
    if (reference !== null && this.get(reference.id) === null) {
      return null;
    }

    const session = await this.terminals.store.add(this.workspaceId, options);
    if (this.disposed) {
      await this.terminals.delete(session.id);
      return null;
    }

    const added = addPanel(
      this.dockview,
      this.panels,
      {
        id: `terminal:${session.id.session}`,
        component: 'terminal',
        tabComponent: 'terminal',
        title: session.name,
        params: { session: session.id.session },
        inactive: true,
        minimumWidth: 10,
        minimumHeight: 10,
      },
      placement,
    );
    const panel = added && this.get(added.id);
    if (panel?.type !== 'terminal') {
      await this.terminals.delete(session.id);
      return null;
    }

    if (activate) {
      this.activate(panel);
    } else {
      this.show(panel);
    }
    return panel;
  }

  move(panel: TabPanel, placement: Placement, activate?: boolean): void;
  move(panel: TablessPanel, placement: GroupPlacement, activate?: boolean): void;
  move(panel: Panel, placement: Placement, activate = true): void {
    const active = activate ? panel : this.activePanel;
    if (!movePanel(this.dockview, this.panels, panel, placement)) {
      return;
    }

    // Dockview activates another panel when the active panel leaves its group, or a group is added.
    this.show(panel);
    if (active !== null && this.groups.some((group) => group.shown?.id === active.id)) {
      this.activate(active);
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

  // TODO: Return false once what a panel shows can refuse, e.g. an editor with unsaved changes.
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
    this.disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
