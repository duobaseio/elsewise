import { isSortable } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { TabPanel } from '@elsewise/frontend-plugin';
import type { DockviewApi, DockviewPanelApi } from 'dockview-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { ApplicationManagerContext } from '@/application-context';
import { DRAG_MODIFIERS, DRAG_PLUGINS, DRAG_SENSORS } from '@/components/drag';

const DragMonotonicContext = createContext<number | null>(null);

export function DraggableDock({ dockview, children }: { dockview: DockviewApi | null; children: ReactNode }) {
  const docks = useContext(ApplicationManagerContext)?.docks;
  const subscribe = useCallback((listener: () => void) => docks?.onChange(listener) ?? (() => {}), [docks]);
  const dock = useSyncExternalStore(subscribe, () => docks?.active ?? null);
  const [monotonic, setMonotonic] = useState(0);

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
      onDragEnd={({ canceled, operation: { source } }) => {
        const moved = source === null ? null : (dock?.get(String(source.id)) ?? null);
        const open = moved === null ? undefined : dockview?.getPanel(moved.id);
        const element = source?.element;
        if (dock === null || dockview === null || !moved?.tab || open === undefined || element == null) {
          return;
        }
        if (!isSortable(source)) {
          return;
        }

        const target = canceled
          ? { group: open.group.id, index: open.group.panels.indexOf(open) }
          : { group: String(source.group), index: source.index };
        // Dockview rebuilds the tab from its own panels, which discards the order the drag left the tabs in. The drag
        // puts the dropped tab back wherever dockview rebuilds a group around it, so the move waits for the drop to end.
        const move = () => {
          // The group may have closed while the drop ended, which leaves the tab where it is.
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
        };
        if (!element.hasAttribute('data-dnd-dragging')) {
          move();
          return;
        }

        const observer = new MutationObserver(() => {
          if (!element.hasAttribute('data-dnd-dragging')) {
            observer.disconnect();
            move();
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-dnd-dragging'] });
      }}
      modifiers={DRAG_MODIFIERS}
      plugins={DRAG_PLUGINS}
      sensors={DRAG_SENSORS}
    >
      <DragMonotonicContext value={dock === null ? null : monotonic}>{children}</DragMonotonicContext>
    </DragDropProvider>
  );
}

/**
 * Makes the tab it is rendered in sortable among the dock's tabs. Outside an active dock that moves its tabs, it does nothing.
 */
export function TabSortable({ api }: { api: DockviewPanelApi }) {
  const monotonic = useContext(DragMonotonicContext);
  if (monotonic === null) {
    return null;
  }

  // Dockview builds a new tab element on every move, and a drag leaves the sortables with the order it showed.
  return <TabSortableRegistration api={api} key={monotonic} />;
}

function TabSortableRegistration({ api }: { api: DockviewPanelApi }) {
  const [marker, setMarker] = useState<HTMLElement | null>(null);

  useSortable({
    id: api.id,
    index: api.group.panels.findIndex((panel) => panel.id === api.id),
    group: api.group.id,
    type: 'tab',
    accept: 'tab',
    element: marker?.closest('.dv-tab'),
  });
  return <span hidden ref={setMarker} />;
}
