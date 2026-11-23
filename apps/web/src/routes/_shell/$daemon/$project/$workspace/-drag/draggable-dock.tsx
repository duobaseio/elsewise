import type { DragOperation } from '@dnd-kit/abstract';
import type { DragDropManager, Draggable, Droppable } from '@dnd-kit/dom';
import { isSortable } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import type { TabPanel } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
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
import { DroppableGroup, type GroupTarget } from './droppable-group';

export const DragMonotonicContext = createContext<number | null>(null);

export function DraggableDock({ dockview, children }: { dockview: DockviewApi | null; children: ReactNode }) {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const subscribe = useCallback((listener: () => void) => docks?.onChange(listener) ?? (() => {}), [docks]);
  const dock = useSyncExternalStore(subscribe, () => docks?.active ?? null);
  const [monotonic, setMonotonic] = useState(0);
  const preview = useRef<Element | null>(null);
  const dragging = useRef(false);

  // The group that the dragged tab would join as its last tab.
  const destination = ({ source, target, position, shape }: DragOperation<Draggable, Droppable>) => {
    if (target?.type !== 'group' || target.element === undefined || !isSortable(source)) {
      return null;
    }

    // Already shown in this group.
    const { group, part } = target.data as GroupTarget;
    if (group === source.group) {
      return null;
    }

    if (part === 'strip') {
      // Only the space after the tabs.
      const tabs = target.element.querySelector('.dv-tabs-container');
      if (tabs !== null && (shape?.current.center.x ?? position.current.x) < tabs.getBoundingClientRect().right) {
        return null;
      }
    } else {
      const { left, top, width, height } = target.element.getBoundingClientRect();
      const x = (position.current.x - left) / width;
      const y = (position.current.y - top) / height;
      // TODO: Split the group on the nearest side.
      if (Math.min(x, 1 - x, y, 1 - y) < 0.2) {
        return null;
      }
    }
    return { group, part, element: target.element };
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

  const show = (manager: DragDropManager) => {
    const operation = manager.dragOperation;
    const to = destination(operation);
    if (to?.part === 'strip') {
      // Tabs slide only after the drag has rendered.
      void manager.renderer.rendering.then(() => {
        const to = destination(manager.dragOperation);
        if (to?.part === 'strip') {
          append(manager, to.group);
        }
      });
    }

    const element = to?.part === 'content' ? to.element : null;
    if (preview.current !== element) {
      preview.current?.removeAttribute('data-drop-target');
      element?.setAttribute('data-drop-target', '');
      preview.current = element;
    }
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

  return (
    <DragDropProvider
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragMove={(_, manager) => show(manager)}
      onDragOver={(_, manager) => show(manager)}
      onDragEnd={({ canceled, operation }, manager) => {
        const { source, target: dropped } = operation;
        const to = canceled ? null : destination(operation);
        preview.current?.removeAttribute('data-drop-target');
        preview.current = null;
        // Drops where the tab shows.
        if (to !== null) {
          append(manager, to.group);
        }

        const moved = source === null ? null : (dock?.get(String(source.id)) ?? null);
        const open = moved === null ? undefined : dockview?.getPanel(moved.id);
        const element = source?.element;
        if (
          dock === null ||
          dockview === null ||
          !moved?.tab ||
          open === undefined ||
          element == null ||
          !isSortable(source)
        ) {
          dragging.current = false;
          return;
        }

        let target = { group: open.group.id, index: open.group.panels.indexOf(open) };
        if (
          to !== null ||
          (!canceled && dropped !== null && (isSortable(dropped) || dropped.data.group === source.group))
        ) {
          target = { group: String(source.group), index: source.index };
        }
        // TODO: Move at once when dnd kit ends a drop before it reports it. Until then, a tab that dockview rebuilds
        // shows beside the placeholder of the dragged one.
        const observer = new MutationObserver(() => {
          if (element.hasAttribute('data-dnd-dragging')) {
            return;
          }

          observer.disconnect();
          // The group may have closed.
          const group = dockview.groups.find((group) => group.id === target.group) ?? open.group;
          const tabs = group.panels
            .map((panel) => dock.get(panel.id))
            .filter((panel): panel is TabPanel => panel?.tab === true && panel.id !== moved.id);
          const next = tabs[group.id === target.group ? target.index : group.panels.indexOf(open)];
          dock.move(
            moved,
            next === undefined ? { tab: 'last', with: tabs.at(-1) ?? moved } : { tab: 'before', of: next },
          );
          setMonotonic((monotonic) => monotonic + 1);
          dragging.current = false;
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-dnd-dragging'] });
      }}
      modifiers={DRAG_MODIFIERS}
      plugins={DRAG_INSTANT_PLUGINS}
      sensors={DRAG_SENSORS}
    >
      <DragMonotonicContext value={dock === null ? null : monotonic}>{children}</DragMonotonicContext>
      {dock !== null &&
        dockview?.groups
          .filter((group) => group.panels.every((panel) => dock.get(panel.id)?.tab === true))
          .map((group) => <DroppableGroup group={group} dragging={dragging} key={group.id} />)}
    </DragDropProvider>
  );
}
