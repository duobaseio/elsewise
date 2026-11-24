import { afterEach, describe, expect, test } from 'vitest';
import {
  cancel,
  content,
  drop,
  fills,
  frames,
  group,
  hold,
  model,
  mount,
  move,
  tab,
} from '../../../../../../../test/dock-drag';
import { edge } from './droppable-edges';

const boxes: Element[] = [];

function box(left: number, top: number, width: number, height: number) {
  const element = document.createElement('div');
  element.style.cssText = `position: fixed; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;`;
  document.body.append(element);
  boxes.push(element);
  return element;
}

afterEach(() => {
  for (const element of boxes.splice(0)) {
    element.remove();
  }
});

describe('edge', () => {
  // A dock that is 400 wide and 300 tall.
  const dock = () => box(100, 100, 400, 300);

  test.each([
    ['left', 110, 250],
    ['right', 490, 250],
    ['bottom', 300, 390],
  ] as const)('returns %s edge within band', (expected, x, y) => {
    expect(edge({ x, y }, dock(), [])).toBe(expected);
  });

  test('returns null beyond band', () => {
    expect(edge({ x: 300, y: 250 }, dock(), [])).toBeNull();
  });

  test('returns null near top', () => {
    expect(edge({ x: 300, y: 105 }, dock(), [])).toBeNull();
  });

  test('returns null outside dock', () => {
    expect(edge({ x: 90, y: 250 }, dock(), [])).toBeNull();
  });

  test.each([
    ['left', 110, 250, 100, 100, 200, 300],
    ['right', 490, 250, 300, 100, 200, 300],
    ['bottom', 300, 390, 100, 250, 400, 150],
  ] as const)('returns null over group spanning %s edge', (_, x, y, left, top, width, height) => {
    expect(edge({ x, y }, dock(), [box(left, top, width, height)])).toBeNull();
  });

  test('returns edge over group spanning part of edge', () => {
    expect(edge({ x: 110, y: 150 }, dock(), [box(100, 100, 200, 150)])).toBe('left');
  });

  test('ignores group away from pointer', () => {
    expect(edge({ x: 490, y: 250 }, dock(), [box(100, 100, 200, 300)])).toBe('right');
  });
});

describe('DroppableEdges', () => {
  test.each([
    ['left', 10, 525],
    ['right', 1054, 525],
    ['bottom', 200, 690],
  ] as const)('adds group along %s edge of dock that tab is dropped on', async (edge, x, y) => {
    const dockview = await mount();
    const root = tab('a').closest('.dv-dockview') as HTMLElement;
    const dock = root.getBoundingClientRect();

    await hold('a', tab('b'));
    await move(root, x / dock.width, y / dock.height);
    expect(root.getAttribute('data-drop-target')).toBe(edge);
    const fill = {
      width: Number.parseFloat(getComputedStyle(root, '::after').width),
      height: Number.parseFloat(getComputedStyle(root, '::after').height),
    };
    await drop(dockview);

    expect(model(dockview)).toEqual(['a', 'b,c', 'd,e', 'f', 'fileTree']);
    expect(fills()).toBe(0);
    // The new group is as large as the fill, and spans the edge.
    const added = group('a').getBoundingClientRect();
    if (edge === 'bottom') {
      expect(added.width).toBeCloseTo(dock.width, -1);
      expect(added.height).toBeCloseTo(fill.height, -1);
      expect(added.bottom).toBeCloseTo(dock.bottom, -1);
    } else {
      expect(added.height).toBeCloseTo(dock.height, -1);
      expect(added.width).toBeCloseTo(fill.width, -1);
      expect(added[edge]).toBeCloseTo(dock[edge], -1);
    }
  });

  test('splits group that spans edge of dock', async () => {
    const dockview = await mount();
    for (const id of ['d', 'e', 'f']) {
      dockview.getPanel(id)?.api.close();
    }
    await frames();
    const root = tab('a').closest('.dv-dockview') as HTMLElement;

    await hold('a', content('a'));
    await move(root, 10 / root.getBoundingClientRect().width, 0.5);
    expect(root.hasAttribute('data-drop-target')).toBe(false);
    expect(content('b').getAttribute('data-drop-target')).toBe('left');
    await drop(dockview);

    expect(model(dockview)).toEqual(['a', 'b,c', 'fileTree']);
    expect(group('a').getBoundingClientRect().right).toBeLessThanOrEqual(group('b').getBoundingClientRect().left + 1);
  });

  test('sorts tab held over tab near edge of dock', async () => {
    const dockview = await mount();

    await hold('b', tab('a'));
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['b,a,c', 'd,e', 'f', 'fileTree']);
  });

  test('clears edge fill when cancelled', async () => {
    const dockview = await mount();
    const root = tab('a').closest('.dv-dockview') as HTMLElement;

    await hold('a', tab('b'));
    await move(root, 0.25, 0.99);
    expect(fills()).toBe(1);
    await cancel(dockview);

    expect(fills()).toBe(0);
    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });
});
