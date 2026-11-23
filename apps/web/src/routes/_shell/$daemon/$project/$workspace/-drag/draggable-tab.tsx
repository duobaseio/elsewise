import { useSortable } from '@dnd-kit/react/sortable';
import type { DockviewPanelApi } from 'dockview-react';
import { useContext, useState } from 'react';
import { CENTERED } from '@/components/drag';
import { DragMonotonicContext } from './draggable-dock';

/**
 * Makes the tab sortable. Does nothing outside an active dock.
 */
export function DraggableTab({ api }: { api: DockviewPanelApi }) {
  const monotonic = useContext(DragMonotonicContext);
  if (monotonic === null) {
    return null;
  }

  // Dockview replaces the tab element on every move.
  return <DraggableTabRegistration api={api} key={monotonic} />;
}

function DraggableTabRegistration({ api }: { api: DockviewPanelApi }) {
  const [marker, setMarker] = useState<HTMLElement | null>(null);

  useSortable({
    id: api.id,
    index: api.group.panels.findIndex((panel) => panel.id === api.id),
    group: api.group.id,
    type: 'tab',
    accept: 'tab',
    collisionDetector: CENTERED,
    element: marker?.closest('.dv-tab'),
  });
  return <span hidden ref={setMarker} />;
}
