import {
  type CollisionDetector,
  CollisionPriority,
  CollisionType,
  type DragOperation,
  Modifier,
} from '@dnd-kit/abstract';
import { AutoScroller, Feedback, PointerActivationConstraints, PointerSensor, PreventSelection } from '@dnd-kit/dom';

// Moves the dragged item by whole device pixels. The pointer reports fractions of a pixel, which blurs the item.
class SnapToPixels extends Modifier {
  override apply({ shape, transform }: DragOperation) {
    const ratio = window.devicePixelRatio;
    const { left = 0, top = 0 } = shape?.initial.boundingRectangle ?? {};
    return {
      x: Math.round((left + transform.x) * ratio) / ratio - left,
      y: Math.round((top + transform.y) * ratio) / ratio - top,
    };
  }
}

// Matches by the dragged item's centre.
export const CENTERED: CollisionDetector = ({ dragOperation, droppable }) => {
  const centre = dragOperation.shape?.current.center;
  if (centre === undefined || droppable.shape?.containsPoint(centre) !== true) {
    return null;
  }

  const { x, y } = droppable.shape.center;
  return {
    id: droppable.id,
    value: 1 / Math.hypot(x - centre.x, y - centre.y),
    type: CollisionType.PointerIntersection,
    priority: CollisionPriority.High,
  };
};

export const DRAG_MODIFIERS = [SnapToPixels];

export const DRAG_PLUGINS = [AutoScroller, Feedback, PreventSelection];

export const DRAG_INSTANT_PLUGINS = [Feedback.configure({ dropAnimation: null }), PreventSelection];

export const DRAG_SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];
