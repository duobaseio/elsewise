import type { DragOperation } from '@dnd-kit/abstract';
import type { DragDropManager, Draggable, Droppable } from '@dnd-kit/dom';
import { isSortable } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import type { Dock, GroupPlacement, Panel, TabPlacement } from '@elsewise/frontend-plugin';
import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ApplicationManagerContext } from '@/application-context';
import { DRAG_INSTANT_PLUGINS, DRAG_MODIFIERS, DRAG_SENSORS } from '@/components/drag';
import { DroppableEdges, type Edge, edge } from './droppable-edges';
import { DroppableGroup, type GroupTarget } from './droppable-group';

export const DragMonotonicContext = createContext<number | null>(null);

type Destination =
  | { readonly part: 'strip'; readonly group: string; readonly element: Element }
  | {
      readonly part: 'content';
      readonly group: string;
      readonly side?: 'left' | 'right' | 'above' | 'below';
      readonly element: Element;
    }
  | { readonly part: 'dock'; readonly edge: Edge; readonly element: Element };

export function DraggableDock({ dockview, children }: { dockview: DockviewApi | null; children: ReactNode }) {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const subscribe = useCallback((listener: () => void) => docks?.onChange(listener) ?? (() => {}), [docks]);
  const dock = useSyncExternalStore(subscribe, () => docks?.active ?? null);
  const [monotonic, setMonotonic] = useState(0);
  const preview = useRef<Element | null>(null);
  const dragging = useRef(false);
  const tabGroups =
    dock === null || dockview === null
      ? []
      : dockview.groups.filter((group) => group.panels.every((panel) => dock.get(panel.id)?.tab === true));

  // Where a dropped tab goes:
  // * into a group as its last tab
  // * beside a group
  // * along an edge of the dock
  const destination = (
    { source, target, position, shape }: DragOperation<Draggable, Droppable>,
    pointer = position.current,
  ): Destination | null => {
    if (target?.element === undefined || !isSortable(source)) {
      return null;
    }

    if (target.type === 'dock') {
      const own = dockview?.getPanel(String(source.id))?.group.element;
      const at = edge(pointer, target.element, [...tabGroups.map((group) => group.element), ...(own ? [own] : [])]);
      return at === null ? null : { part: 'dock', edge: at, element: target.element };
    }

    if (target.type !== 'group') {
      return null;
    }

    const { group, part } = target.data as GroupTarget;
    if (part === 'strip') {
      // Only the space after the tabs of a group that the tab is not shown in.
      const tabs = target.element.querySelector('.dv-tabs-container');
      return group === source.group ||
        (tabs !== null && (shape?.current.center.x ?? pointer.x) < tabs.getBoundingClientRect().right)
        ? null
        : { part, group, element: target.element };
    }

    const { left, top, width, height } = target.element.getBoundingClientRect();
    const x = (pointer.x - left) / width;
    const y = (pointer.y - top) / height;
    const nearest = Math.min(x, 1 - x, y, 1 - y);
    if (nearest >= 0.2) {
      return group === source.group || source.type === 'tabless' ? null : { part, group, element: target.element };
    }

    // A group's only tab has no tab to split from.
    if (dockview?.groups.find(({ id }) => id === group)?.panels.some(({ id }) => id !== source.id) !== true) {
      return null;
    }

    return {
      part,
      group,
      side: nearest === x ? 'left' : nearest === 1 - x ? 'right' : nearest === y ? 'above' : 'below',
      element: target.element,
    };
  };

  // Shows the dragged tab as the group's last tab.
  const append = ({ dragOperation: { source }, registry }: DragDropManager, id: string) => {
    const group = dockview?.groups.find((group) => group.id === id);
    if (group === undefined || !isSortable(source) || source.element === undefined) {
      return;
    }

    // Renumbered tabs slide.
    const left = [];
    for (const tab of registry.draggables) {
      if (isSortable(tab) && tab !== source && tab.sortable.group === source.sortable.group) {
        left.push(tab.sortable);
      }
    }
    group.element.querySelector('.dv-tabs-container')?.append(source.element);
    for (const [index, sortable] of left.sort((a, b) => a.index - b.index).entries()) {
      sortable.index = index;
    }
    source.sortable.group = id;
    source.sortable.index = group.panels.length;
  };

  // dnd kit reports a move before it updates the pointer.
  const show = (manager: DragDropManager, pointer?: { x: number; y: number }) => {
    const operation = manager.dragOperation;
    const to = destination(operation, pointer);
    if (to?.part === 'strip') {
      // Tabs slide only after the drag has rendered.
      void manager.renderer.rendering.then(() => {
        const to = destination(manager.dragOperation);
        if (to?.part === 'strip') {
          append(manager, to.group);
        }
      });
    }

    const element = to === null || to.part === 'strip' ? null : to.element;
    if (preview.current !== element) {
      preview.current?.removeAttribute('data-drop-target');
      preview.current = element;
    }
    element?.setAttribute(
      'data-drop-target',
      to?.part === 'dock' ? to.edge : to?.part === 'content' ? (to.side ?? '') : '',
    );
  };

  useEffect(() => {
    if (dockview === null) {
      return undefined;
    }

    const advance = () => setMonotonic((monotonic) => monotonic + 1);
    const disposables = [
      dockview.onDidAddPanel(advance),
      dockview.onDidRemovePanel(advance),
      dockview.onDidMovePanel(advance),
    ];
    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [dockview]);

  const root = dockview?.groups[0]?.element.closest('.dv-dockview');
  return (
    <DragDropProvider
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragMove={({ to }, manager) => show(manager, to)}
      onDragOver={(_, manager) => show(manager)}
      onDragEnd={({ canceled, operation }, manager) => {
        const { source, target: dropped } = operation;
        const to = canceled ? null : destination(operation);
        preview.current?.removeAttribute('data-drop-target');
        preview.current = null;

        const joined = to?.part === 'strip' || (to?.part === 'content' && to.side === undefined) ? to.group : null;
        if (joined !== null) {
          append(manager, joined);
        }

        const moved = source === null ? null : (dock?.get(String(source.id)) ?? null);
        const open = moved === null ? undefined : dockview?.getPanel(moved.id);
        const element = source?.element;
        if (
          dock === null ||
          dockview === null ||
          moved === null ||
          open === undefined ||
          element == null ||
          !isSortable(source)
        ) {
          dragging.current = false;
          return;
        }

        const newGroup = newGroupPlacement(dockview, dock, moved, to);

        let move: (() => void) | null;
        if (moved.tab) {
          const shown =
            canceled || dropped === null ? undefined : dockview.groups.find((group) => group.id === source.group);
          const placement =
            newGroup ??
            tabPlacement(
              dock,
              moved,
              shown ?? open.group,
              shown === undefined ? open.group.panels.indexOf(open) : source.index,
            );
          move = () => dock.move(moved, placement);
        } else {
          move = newGroup && (() => dock.move(moved, newGroup));
        }

        // TODO: Move at once when dnd kit ends a drop before it reports it. Until then, a tab that dockview rebuilds
        // shows beside the placeholder of the dragged one.
        const observer = new MutationObserver(() => {
          if (!element.hasAttribute('data-dnd-dragging')) {
            observer.disconnect();

            // TODO: Drop once dockview moves a tab without removing and adding it. Until then, dockview activates
            // another tab in the intermission and scrolls to it, so the scroll positions are saved before a move and
            // restored afterward.
            const strips = [...(root?.querySelectorAll('.dv-tabs-container') ?? [])].map(
              (strip) => [strip, strip.scrollLeft] as const,
            );
            move?.();
            for (const [strip, left] of strips) {
              strip.scrollLeft = left;
            }

            setMonotonic((monotonic) => monotonic + 1);
            dragging.current = false;
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-dnd-dragging'] });
      }}
      modifiers={DRAG_MODIFIERS}
      // TODO: Scroll a strip while a tab is held once dockview exposes it.
      plugins={DRAG_INSTANT_PLUGINS}
      sensors={DRAG_SENSORS}
    >
      <DragMonotonicContext value={dock === null ? null : monotonic}>{children}</DragMonotonicContext>
      {tabGroups.map((group) => (
        <DroppableGroup group={group} dragging={dragging} key={group.id} />
      ))}
      {dock !== null && root != null && <DroppableEdges dock={root} groups={tabGroups.map((group) => group.element)} />}
    </DragDropProvider>
  );
}

// The placement of `panel` in a group of its own.
function newGroupPlacement(
  dockview: DockviewApi,
  dock: Dock,
  panel: Panel,
  to: Destination | null,
): GroupPlacement | null {
  const group = dockview.getPanel(panel.id)?.group;
  if (group === undefined) {
    return null;
  }

  // A tabless panel in a row keeps its width when it moves to a row, and one in a column keeps its height.
  const row = group.element.closest('.dv-split-view-container')?.classList.contains('dv-horizontal');
  const width = !panel.tab && row === true ? group.width : undefined;
  const height = !panel.tab && row === false ? group.height : undefined;

  if (to?.part === 'dock') {
    const box = to.element.getBoundingClientRect();
    return to.edge === 'bottom'
      ? { edge: 'bottom', height: height ?? box.height / 4 }
      : { edge: to.edge, width: width ?? box.width / 4 };
  }

  if (to?.part !== 'content' || to.side === undefined) {
    return null;
  }

  const beside = dockview.groups
    .find(({ id }) => id === to.group)
    ?.panels.map(({ id }) => dock.get(id))
    .find((other) => other !== null && other.id !== panel.id);
  if (beside == null) {
    return null;
  }

  return to.side === 'left' || to.side === 'right'
    ? { group: to.side, of: beside, width }
    : { group: to.side, of: beside, height };
}

// The placement of `panel` among the `group`'s tabs, before the tab at `index`.
function tabPlacement(dock: Dock, panel: Panel, group: DockviewGroupPanel, index: number): TabPlacement {
  const tabs = group.panels
    .map(({ id }) => dock.get(id))
    .filter((tab): tab is Panel => tab?.tab === true && tab.id !== panel.id);
  const next = tabs[index];

  return next === undefined ? { tab: 'last', with: tabs.at(-1) ?? panel } : { tab: 'before', of: next };
}
