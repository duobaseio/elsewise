import type { GroupPlacement, Panel, Placement } from '@elsewise/frontend-plugin';
import type { AddPanelOptions, DockviewApi, IDockviewPanel } from 'dockview-react';

const EDGES = { left: 'left', right: 'right', top: 'above', bottom: 'below' } as const;
const SIDES = { left: 'left', right: 'right', above: 'top', below: 'bottom' } as const;

/**
 * Adds a panel to `dockview` at `placement`.
 *
 * Returns null if `placement`:
 * * refers to a panel that is not among the open `panels`
 * * puts a tab in the group of a tabless panel
 */
export function addPanel(
  dockview: DockviewApi,
  panels: readonly Panel[],
  options: Omit<AddPanelOptions, 'position' | 'floating'>,
  placement: Placement,
): IDockviewPanel | null {
  if ('edge' in placement) {
    const { width, height } = extent(placement.edge, placement);
    return dockview.addPanel({
      ...options,
      initialWidth: width,
      initialHeight: height,
      position: { direction: EDGES[placement.edge] },
    });
  }

  const id = 'of' in placement ? placement.of.id : placement.with.id;
  const reference = panels.find((panel) => panel.id === id);
  const group = dockview.getPanel(id)?.group;
  if (reference === undefined || group === undefined) {
    return null;
  }

  if ('group' in placement) {
    const { width, height } = extent(placement.group, placement);
    return dockview.addPanel({
      ...options,
      initialWidth: width,
      initialHeight: height,
      position: { referenceGroup: group, direction: placement.group },
    });
  }

  if (!reference.tab) {
    return null;
  }

  const at = group.panels.findIndex((panel) => panel.id === id);
  const index = { first: 0, last: group.panels.length, before: at, after: at + 1 }[placement.tab];
  return dockview.addPanel({ ...options, position: { referenceGroup: group, direction: 'within', index } });
}

/**
 * Moves the open panel `moved` in `dockview` to `placement`, without activating it.
 *
 * Returns false if `placement`:
 * * refers to a panel that is not among the open `panels`
 * * puts a tab in the group of a tabless panel, or a tabless panel among tabs
 * * puts a panel before or after itself
 */
export function movePanel(
  dockview: DockviewApi,
  panels: readonly Panel[],
  moved: Panel,
  placement: Placement,
): boolean {
  const panel = dockview.getPanel(moved.id);
  if (panel === undefined) {
    return false;
  }

  if ('edge' in placement) {
    panel.api.moveTo({ group: dockview.addGroup({ direction: EDGES[placement.edge] }), skipSetActive: true });
    panel.group.api.setSize(extent(placement.edge, placement));
    return true;
  }

  const id = 'of' in placement ? placement.of.id : placement.with.id;
  const reference = panels.find((panel) => panel.id === id);
  const group = dockview.getPanel(id)?.group;
  if (reference === undefined || group === undefined) {
    return false;
  }

  if ('group' in placement) {
    panel.api.moveTo({ group, position: SIDES[placement.group], skipSetActive: true });
    panel.group.api.setSize(extent(placement.group, placement));
    return true;
  }

  if (!reference.tab || !moved.tab || (moved.id === id && 'of' in placement)) {
    return false;
  }

  // Dockview takes the moved panel out of its group before it places it.
  const tabs = group.panels.filter((tab) => tab.id !== moved.id);
  const at = tabs.findIndex((tab) => tab.id === id);
  const index = { first: 0, last: tabs.length, before: at, after: at + 1 }[placement.tab];
  panel.api.moveTo({ group, index, skipSetActive: true });
  return true;
}

function extent(side: string, placement: GroupPlacement): { width?: number; height?: number } {
  return side === 'left' || side === 'right'
    ? { width: 'width' in placement ? placement.width : undefined }
    : { height: 'height' in placement ? placement.height : undefined };
}
