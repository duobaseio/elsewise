import { CollisionPriority, CollisionType } from '@dnd-kit/abstract';
import { useDroppable } from '@dnd-kit/react';

export type Edge = 'left' | 'right' | 'bottom';

const BAND = 24;

export function DroppableEdges({ dock, groups }: { dock: Element; groups: readonly Element[] }) {
  // Tabs and strips win over the edges, and the edges over content.
  useDroppable({
    id: 'dock',
    type: 'dock',
    accept: 'tab',
    collisionDetector: ({ dragOperation, droppable }) =>
      edge(dragOperation.position.current, dock, groups) === null
        ? null
        : { id: droppable.id, value: 1, type: CollisionType.PointerIntersection, priority: CollisionPriority.Low },
    collisionPriority: CollisionPriority.Low,
    element: dock,
  });
  return null;
}

/**
 * Returns the edge of the dock that a tab dropped at `pointer` is placed along, or null.
 *
 * A group among `groups` that spans the edge is split to the same end, so the tab splits it.
 */
export function edge(pointer: { x: number; y: number }, dock: Element, groups: readonly Element[]): Edge | null {
  const { x, y } = pointer;
  const { left, right, top, bottom } = dock.getBoundingClientRect();
  const nearest = Math.min(x - left, right - x, bottom - y);
  if (x < left || x > right || y < top || y > bottom || nearest > BAND) {
    return null;
  }

  const at = nearest === x - left ? 'left' : nearest === right - x ? 'right' : 'bottom';
  for (const group of groups) {
    const box = group.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
      continue;
    }

    if (
      at === 'bottom' ? box.left <= left + 1 && box.right >= right - 1 : box.top <= top + 1 && box.bottom >= bottom - 1
    ) {
      return null;
    }
  }
  return at;
}
