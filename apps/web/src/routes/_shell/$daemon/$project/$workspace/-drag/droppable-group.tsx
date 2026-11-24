import { CollisionPriority } from '@dnd-kit/abstract';
import { pointerIntersection } from '@dnd-kit/collision';
import { useDroppable } from '@dnd-kit/react';
import type { DockviewGroupPanel } from 'dockview-react';
import { type RefObject, useEffect } from 'react';
import { CENTERED } from '@/components/drag';

export interface GroupTarget {
  /**
   * The id of the dockview group.
   */
  readonly group: string;
  readonly part: 'strip' | 'content';
}

export function DroppableGroup({ group, dragging }: { group: DockviewGroupPanel; dragging: RefObject<boolean> }) {
  // The strip resizes as its tabs slide when a dragged tab joins or leaves them.
  // Disclaimer: This effect is AI generated.
  useEffect(() => {
    const tabs = group.element.querySelector('.dv-tabs-container');
    const strip = tabs?.parentElement;
    if (tabs == null || strip == null) {
      return undefined;
    }

    let width = strip.getBoundingClientRect().width;
    const resizes = new ResizeObserver(() => {
      width = strip.getBoundingClientRect().width;
    });
    const changes = new MutationObserver(() => {
      const edge = width + Number.parseFloat(getComputedStyle(strip).marginRight);
      for (const animation of strip.getAnimations()) {
        animation.cancel();
      }
      const resized = strip.getBoundingClientRect().width;
      if (dragging.current && resized !== edge && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // A strip narrower than its tabs overflows, so one that grows only holds back what follows it.
        strip.animate(
          resized < edge ? { width: [`${edge}px`, `${resized}px`] } : { marginRight: [`${edge - resized}px`, '0px'] },
          { duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
        );
        width = strip.getBoundingClientRect().width;
      }
    });
    resizes.observe(strip);
    changes.observe(tabs, { childList: true });
    return () => {
      resizes.disconnect();
      changes.disconnect();
    };
  }, [group, dragging]);

  // Tabs win over the strip, and the strip over content.
  useDroppable({
    id: `strip:${group.id}`,
    type: 'group',
    accept: 'tab',
    collisionDetector: CENTERED,
    collisionPriority: CollisionPriority.Normal,
    data: { group: group.id, part: 'strip' } satisfies GroupTarget,
    element: group.element.querySelector('.dv-tabs-and-actions-container'),
  });
  useDroppable({
    id: `content:${group.id}`,
    type: 'group',
    accept: ['tab', 'tabless'],
    collisionDetector: pointerIntersection,
    collisionPriority: CollisionPriority.Lowest,
    data: { group: group.id, part: 'content' } satisfies GroupTarget,
    element: group.element.querySelector('.dv-content-container'),
  });
  return null;
}
