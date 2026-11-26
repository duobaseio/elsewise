import type { Group, Layout, Panel, WorkspaceId } from '@elsewise/frontend-plugin';
import { type DockviewApi, type IDockviewPanel, Orientation, type SerializedDockview } from 'dockview-react';

export interface DockSnapshot {
  readonly panels: readonly Panel[];
  readonly groups: readonly Group[];
  readonly layout: Layout | null;
  readonly activePanel: Panel | null;
  readonly activeTabPanel: Panel | null;
}

/**
 * A workspace's dock as last read from its dockview.
 */
export class DockStore {
  snapshot: DockSnapshot;
  /**
   * The ids of the open panels that were active, from the latest.
   */
  private recent: string[] = [];

  constructor(
    private readonly workspace: WorkspaceId,
    private readonly dockview: DockviewApi,
  ) {
    this.snapshot = this.map();
  }

  update(): boolean {
    const snapshot = this.map();
    if (JSON.stringify(snapshot) === JSON.stringify(this.snapshot)) {
      return false;
    }

    this.snapshot = snapshot;
    return true;
  }

  private map(): DockSnapshot {
    const open = new Map<string, Panel>();
    for (const panel of this.dockview.panels) {
      const mapped = this.mapPanel(panel);
      if (mapped !== null) {
        open.set(panel.id, mapped);
      }
    }

    const active = this.dockview.activePanel?.id;
    this.recent = [
      ...(active !== undefined && open.has(active) ? [active] : []),
      ...this.recent.filter((id) => id !== active && open.has(id)),
    ];

    const groups: Group[] = [];
    const grid = this.dockview.toJSON().grid;
    const layout = this.mapLayout(
      grid.root,
      grid.orientation === Orientation.HORIZONTAL ? 'row' : 'column',
      open,
      groups,
    );
    const panels = groups.flatMap((group) => group.panels);
    const shown = groups.flatMap((group) => (group.shown === null ? [] : [group.shown]));
    const recent = this.recent.flatMap((id) => open.get(id) ?? []);
    const tabs = (candidates: readonly Panel[]) => candidates.filter((panel) => panel.tab);

    return {
      panels,
      groups,
      layout,
      activePanel: recent.find((panel) => shown.includes(panel)) ?? shown[0] ?? null,
      activeTabPanel: tabs(recent)[0] ?? tabs(shown)[0] ?? tabs(panels)[0] ?? null,
    };
  }

  private mapPanel(panel: IDockviewPanel): Panel | null {
    switch (panel.view.contentComponent) {
      case 'placeholder':
        return { id: panel.id, type: 'placeholder', tab: true, closable: false };
      case 'file':
        return { id: panel.id, type: 'file', tab: true, closable: true, relativePath: panel.params?.path };
      case 'terminal':
        return {
          id: panel.id,
          type: 'terminal',
          tab: true,
          closable: true,
          session: { ...this.workspace, session: panel.params?.session },
          closeConfirmation: panel.params?.closeConfirmation === true,
        };
      case 'fileTree':
        return { id: panel.id, type: 'fileTree', tab: false, closable: false };
      default:
        return null;
    }
  }

  private mapLayout(
    node: SerializedDockview['grid']['root'],
    direction: 'row' | 'column',
    open: ReadonlyMap<string, Panel>,
    groups: Group[],
  ): Layout | null {
    if (!Array.isArray(node.data)) {
      const panels = node.data.views.flatMap((id) => open.get(id) ?? []);
      if (panels.length === 0) {
        return null;
      }

      const visible = this.dockview.getGroup(node.data.id)?.api.isVisible ?? true;
      const group = { panels, shown: visible ? (open.get(node.data.activeView ?? '') ?? null) : null };
      groups.push(group);
      return group;
    }

    // Dockview keeps branches with one child, and branches in the direction of their parent.
    const children = node.data.flatMap((child) => {
      const layout = this.mapLayout(child, direction === 'row' ? 'column' : 'row', open, groups);
      if (layout === null) {
        return [];
      }
      return 'children' in layout && layout.direction === direction ? layout.children : [layout];
    });
    if (children.length <= 1) {
      return children[0] ?? null;
    }
    return { direction, children };
  }
}
