import type {
  CustomPanel,
  Dock,
  FilePanel,
  Group,
  Layout,
  Panel,
  Placement,
  TerminalOptions,
  TerminalPanel,
  Workspace,
  WorkspaceId,
} from '@elsewise/frontend-plugin';
import { type DockviewApi, type DockviewIDisposable, Orientation, type SerializedDockview } from 'dockview-react';
import type { ApplicationManager } from '@/application-manager';
import { sameWorkspace } from '@/projects/workspace-manager';
import { DockStore, isCustomPanel } from './dock-store';
import { addPanel, movePanel } from './placement';

/**
 * A workspace's dock, read from its dockview.
 */
export class DockManager implements Dock {
  private readonly disposables: DockviewIDisposable[];
  private readonly store: DockStore;
  private readonly closing = new Map<string, Promise<boolean>>();
  private grid: SerializedDockview['grid'];
  private changed = false;
  private disposed = false;
  private resolved: Workspace | null = null;

  constructor(
    readonly workspaceId: WorkspaceId,
    private readonly dockview: DockviewApi,
    private readonly application: ApplicationManager,
    onOpen: (panel: Panel) => void,
    onClose: (panel: Panel) => void,
    onChange: () => void,
  ) {
    this.store = new DockStore(workspaceId, dockview);
    this.grid = dockview.toJSON().grid;
    this.disposables = [
      dockview.onDidAddPanel((added) => {
        this.update();
        if (this.panels.some((panel) => panel.tab && panel.type !== 'placeholder')) {
          dockview.getPanel('placeholder')?.api.close();
        }
        const panel = this.get(added.id);
        if (panel !== null) {
          onOpen(panel);
        }
      }),
      dockview.onDidRemovePanel((removed) => {
        const panel = this.get(removed.id);
        this.grid = dockview.toJSON().grid;
        this.update();
        // The placeholder takes the place of the last tab panel.
        if (!this.panels.some((panel) => panel.tab)) {
          dockview.addPanel({
            id: 'placeholder',
            tabComponent: 'placeholder',
            component: 'placeholder',
            position: { referenceGroup: removed.group.id },
            minimumWidth: 10,
            minimumHeight: 10,
          });
        }
        if (panel !== null) {
          onClose(panel);
        }
      }),
      dockview.onDidRemoveGroup((removed) => this.restoreSizes(removed.id)),
      dockview.onDidMovePanel((moved) => {
        this.restoreSizes(moved.panel.group.id);
        this.update();
      }),
      dockview.onDidActivePanelChange(() => this.update()),
      // Dockview reports every change as a layout change, after its other events. A resize is one too.
      dockview.onDidLayoutChange(() => {
        this.grid = dockview.toJSON().grid;
        this.update();
        if (this.changed) {
          this.changed = false;
          onChange();
        }
      }),
      { dispose: application.settings.onFrontendChange(() => this.update()) },
    ];
    this.update();
  }

  // TODO: Drop once dockview can give the space of a group that leaves a row or column to a neighbour.
  // Disclaimer: This method is AI generated. It is throwaway code until we have proper sizing on removal working in
  // upstream.
  private restoreSizes(left: string) {
    type Node = SerializedDockview['grid']['root'];
    const leaves = (node: Node): string[] => (Array.isArray(node.data) ? node.data.flatMap(leaves) : [node.data.id]);
    // The children of the innermost row or column that has all of the groups.
    const find = ({ root, orientation }: SerializedDockview['grid'], groups: readonly string[]) => {
      let row = orientation === Orientation.HORIZONTAL;
      let children = Array.isArray(root.data) ? root.data : [];
      while (true) {
        const holders = new Set(groups.map((group) => children.find((child) => leaves(child).includes(group))));
        const [holder] = holders;
        if (holders.size !== 1 || holder === undefined || !Array.isArray(holder.data)) {
          return { children, row };
        }
        children = holder.data;
        row = !row;
      }
    };

    const was = find(this.grid, [left]);
    this.grid = this.dockview.toJSON().grid;

    const index = was.children.findIndex((node) => !Array.isArray(node.data) && node.data.id === left);
    const freed = was.children[index]?.size ?? 0;
    const stayed = was.children.filter((node, at) => at !== index && node.visible !== false);
    const sizes = [freed, ...stayed.map((node) => node.size ?? 0)];
    if (index === -1 || stayed.length < 2 || Math.max(...sizes) - Math.min(...sizes) <= 2) {
      return;
    }

    // The group is still among them when it only changed its place.
    const now = find(
      this.grid,
      stayed.flatMap((node) => leaves(node).slice(0, 1)),
    );
    const current = stayed.map((node) => now.children.find((child) => leaves(child).includes(leaves(node)[0] ?? '')));
    if (now.row !== was.row || now.children.some((node) => !Array.isArray(node.data) && node.data.id === left)) {
      return;
    }

    // The previous group takes the space, or the next. A tabless panel takes it only if no group of tabs can.
    const before = was.children.slice(0, index).reverse();
    const after = was.children.slice(index + 1);
    const nearest = [before[0], after[0], ...before.slice(1), ...after.slice(1)].filter(
      (node) => node !== undefined && stayed.includes(node),
    );
    const taker =
      nearest.find((node) => Array.isArray(node.data) || node.data.views.some((id) => this.get(id)?.tab === true)) ??
      nearest[0];

    // A group that was added since leaves less space.
    let available = 0;
    for (const node of current) {
      available += node?.size ?? 0;
    }
    const scale = available / sizes.reduce((sum, size) => sum + size, 0);
    for (const [at, node] of stayed.entries()) {
      // Only a group that spans a split can size it.
      const split = current[at];
      const spans = Array.isArray(split?.data) ? split.data.find((child) => !Array.isArray(child.data)) : split;
      if (spans === undefined || Array.isArray(spans.data)) {
        continue;
      }

      const extent = ((node.size ?? 0) + (node === taker ? freed : 0)) * scale;
      this.dockview.getGroup(spans.data.id)?.api.setSize(was.row ? { width: extent } : { height: extent });
    }
  }

  get(id: string): Panel | null {
    return this.panels.find((panel) => panel.id === id) ?? null;
  }

  addFile(relativePath: string, placement: Placement, activate = true): FilePanel | null {
    let panel = this.panels.find((open) => open.type === 'file' && open.relativePath === relativePath) ?? null;
    if (panel === null) {
      const added = addPanel(
        this.dockview,
        this.panels,
        {
          id: `file:${crypto.randomUUID()}`,
          tabComponent: 'file',
          component: 'file',
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

    if (panel?.type !== 'file') {
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

    const session = await this.application.terminals.store.add(this.workspaceId, options);
    if (this.disposed) {
      await this.application.terminals.delete(session.id);
      return null;
    }

    const added = addPanel(
      this.dockview,
      this.panels,
      {
        id: `terminal:${session.id.session}`,
        tabComponent: 'terminal',
        component: 'terminal',
        title: session.name,
        params: { session: session.id.session, closeConfirmation: options.closeConfirmation ?? false },
        inactive: true,
        minimumWidth: 10,
        minimumHeight: 10,
      },
      placement,
    );
    const panel = added && this.get(added.id);
    if (panel?.type !== 'terminal') {
      await this.application.terminals.delete(session.id);
      return null;
    }

    if (activate) {
      this.activate(panel);
    } else {
      this.show(panel);
    }
    return panel;
  }

  addPanel(type: CustomPanel['type'], placement: Placement, activate = true): CustomPanel | null {
    const source = this.application.docks.panelSources.find((other) => other.id === type);
    if (source === undefined) {
      return null;
    }

    const open = addPanel(
      this.dockview,
      this.panels,
      {
        id: `custom:${crypto.randomUUID()}`,
        tabComponent: 'custom',
        component: 'custom',
        params: { type: source.id, tab: source.tab, closable: source.closable },
        inactive: true,
        minimumWidth: 10,
        minimumHeight: 10,
      },
      placement,
      source.tab,
    );
    const panel = open && this.get(open.id);
    if (panel == null || !isCustomPanel(panel)) {
      return null;
    }

    if (activate) {
      this.activate(panel);
    } else {
      this.show(panel);
    }
    return panel;
  }

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

  moveFiles(source: string, destination: string) {
    for (const panel of this.panels) {
      if (
        panel.type === 'file' &&
        (panel.relativePath === source || (source.endsWith('/') && panel.relativePath.startsWith(source)))
      ) {
        const path = destination + panel.relativePath.slice(source.length);
        const replaced = this.panels.find(
          (other) => other.type === 'file' && other.id !== panel.id && other.relativePath === path,
        );
        if (replaced !== undefined) {
          this.closeWithSuccessor(replaced);
        }

        this.dockview.getPanel(panel.id)?.api.updateParameters({ path });
      }
    }

    this.application.files.move(this.workspaceId, source, destination);
    this.update();
  }

  activate(panel: Panel): void {
    const open = this.dockview.getPanel(panel.id);
    if (open === undefined) {
      return;
    }

    // A panel that becomes the active one is asked to take the focus as the dock updates.
    const active = this.activePanel?.id === panel.id;
    open.group.api.setVisible(true);
    open.api.setActive();
    this.update();
    if (active) {
      this.application.docks.requestPanelFocus(panel.id);
    }
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

  /**
   * Closes `panel` as the contract has it. With `force`, the panel closes at once: whether it can be closed and what
   * it shows are not asked, e.g. for a terminal whose shell exited.
   */
  close(panel: Panel, force = false): Promise<boolean> {
    if (force) {
      this.closeWithSuccessor(panel);
      return Promise.resolve(true);
    }

    let closing = this.closing.get(panel.id);
    if (closing === undefined) {
      closing = (async () => {
        const open = this.get(panel.id);
        if (open !== null) {
          if (!open.closable) {
            return false;
          }

          let allowed: boolean;
          if (isCustomPanel(open)) {
            const source = this.application.docks.panelSources.find((other) => other.id === open.type);
            allowed = (await source?.close?.(this.application, this, open)) ?? true;
          } else {
            const component = this.application.docks.panelComponents.find((other) => other.type === open.type);
            allowed = (await component?.close?.(this.application, this, open)) ?? true;
          }

          if (!allowed) {
            return false;
          }
        }

        this.closeWithSuccessor(panel);
        return true;
      })().finally(() => this.closing.delete(panel.id));
      this.closing.set(panel.id, closing);
    }
    return closing;
  }

  /**
   * Closes the custom panels whose source was not added.
   */
  closeSourcelessPanels() {
    const sources = this.application.docks.panelSources.map((source) => source.id);
    this.closeCustomPanels(
      this.panels.filter((panel) => isCustomPanel(panel) && !sources.includes(panel.type)).map((panel) => panel.type),
    );
  }

  /**
   * Closes the custom panels of the `sources`.
   */
  closeCustomPanels(sources: readonly string[]) {
    for (const panel of this.panels) {
      if (sources.includes(panel.type)) {
        this.closeWithSuccessor(panel);
      }
    }
  }

  private closeWithSuccessor(panel: Panel) {
    const activation = this.application.settings.frontend.workspace.closeActivation;
    const tabs = this.groups.find((group) => group.shown?.id === panel.id)?.panels;
    if (tabs !== undefined && activation !== 'recent') {
      const index = tabs.findIndex((tab) => tab.id === panel.id);
      const left = tabs[index - 1];
      const right = tabs[index + 1];
      const successor = activation === 'left' ? (left ?? right) : (right ?? left);
      if (successor !== undefined && this.activePanel?.id === panel.id) {
        this.activate(successor);
      } else if (successor !== undefined) {
        this.show(successor);
      }
    }

    this.dockview.getPanel(panel.id)?.api.close();
    this.update();
  }

  private update() {
    const before = this.activePanel?.id;
    if (this.store.update()) {
      this.changed = true;
    }

    const files = this.panels.filter(
      (panel): panel is FilePanel => panel.type === 'file' && panel.relativePath !== undefined,
    );
    const names = this.application.settings.frontend.workspace.uniqueTabNames
      ? uniqueFileNames(files.map((file) => file.relativePath))
      : null;
    for (const { id, relativePath } of files) {
      const open = this.dockview.getPanel(id);
      const title = names?.get(relativePath) ?? relativePath.slice(relativePath.lastIndexOf('/') + 1);
      if (open !== undefined && open.title !== title) {
        open.api.setTitle(title);
      }
    }

    const active = this.activePanel;
    if (active !== null && active.id !== before) {
      this.application.docks.requestPanelFocus(active.id);
    }
  }

  get workspace(): Workspace {
    const active = this.application.projects.workspaces.active;
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

  get activeTabPanel(): Panel | null {
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

  dispose() {
    this.disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

/**
 * Returns the names of the files at `paths`, by path.
 */
export function uniqueFileNames(paths: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const [name, same] of Map.groupBy(new Set(paths), (path) => path.slice(path.lastIndexOf('/') + 1))) {
    for (const [parent, conflicting] of Map.groupBy(same, (path) => path.split('/').at(-2))) {
      if (same.length === 1 || parent === undefined) {
        for (const path of conflicting) {
          names.set(path, name);
        }
        continue;
      }

      const segments = conflicting.map((path) => path.split('/'));
      let common = 0;
      while (segments.every((other) => common < other.length - 2 && other[common] === segments[0]?.[common])) {
        common++;
      }

      const prefixed = segments.map((other) =>
        common === other.length - 2 ? `${parent}/${name}` : `${other[common]}/…/${name}`,
      );
      for (const [index, path] of conflicting.entries()) {
        const unique = prefixed.filter((other) => other === prefixed[index]).length === 1;
        names.set(path, unique ? (prefixed[index] ?? path) : path);
      }
    }
  }
  return names;
}
