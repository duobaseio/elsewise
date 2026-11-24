import { DOMRectangle } from '@dnd-kit/dom/utilities';
import { afterEach, describe, expect, test } from 'vitest';
import { CENTERED } from './drag';

const boxes: Element[] = [];

function shape(left: number, top: number, width: number, height: number) {
  const element = document.createElement('div');
  element.style.cssText = `position: fixed; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
  document.body.append(element);
  boxes.push(element);
  return new DOMRectangle(element);
}

// Matches a droppable against a dragged item, each with the given shape.
const match = (dragged: DOMRectangle | undefined, droppable: DOMRectangle) =>
  CENTERED({
    dragOperation: { shape: dragged === undefined ? null : { current: dragged } },
    droppable: { id: 'droppable', shape: droppable },
  } as unknown as Parameters<typeof CENTERED>[0]);

afterEach(() => {
  for (const element of boxes.splice(0)) {
    element.remove();
  }
});

describe('CENTERED', () => {
  test('matches droppable containing dragged centre', () => {
    expect(match(shape(150, 100, 100, 20), shape(190, 90, 100, 40))?.id).toBe('droppable');
  });

  test('returns null for droppable that dragged item only overlaps', () => {
    expect(match(shape(100, 100, 100, 20), shape(190, 90, 100, 40))).toBeNull();
  });

  test('returns null without dragged shape', () => {
    expect(match(undefined, shape(190, 90, 100, 40))).toBeNull();
  });

  test('ranks droppable with nearer centre higher', () => {
    const dragged = shape(150, 100, 100, 20);
    const near = match(dragged, shape(150, 90, 100, 40));
    const far = match(dragged, shape(0, 0, 1000, 1000));

    expect(near?.value).toBeGreaterThan(far?.value ?? Number.POSITIVE_INFINITY);
  });
});
