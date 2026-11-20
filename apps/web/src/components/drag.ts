import { type DragOperation, Modifier } from '@dnd-kit/abstract';
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

export const DRAG_MODIFIERS = [SnapToPixels];

export const DRAG_PLUGINS = [AutoScroller, Feedback, PreventSelection];

export const DRAG_SENSORS = [
  PointerSensor.configure({
    activationConstraints: () => [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
];
