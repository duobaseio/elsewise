import { describe, expect, test } from 'vitest';
import {
  cancel,
  content,
  dispatch,
  drop,
  fills,
  frames,
  group,
  hold,
  model,
  mount,
  mouse,
  move,
  pointer,
  shown,
  strip,
  tab,
} from '../../../../../../../test/dock-drag';

describe('DraggableDock', () => {
  test('reorders tab within group', async () => {
    const dockview = await mount();

    await hold('a', tab('c'));
    await drop(dockview);

    expect(model(dockview)).toEqual(['b,c,a', 'd,e', 'f', 'fileTree']);
  });

  test('moves tab among other group tabs', async () => {
    const dockview = await mount();

    await hold('a', tab('d'));
    expect(shown()).toContain('a,a,d,e');
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,d,e', 'b,c', 'f', 'fileTree']);
  });

  test('removes group left empty', async () => {
    const dockview = await mount();

    await hold('f', tab('d'));
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'f,d,e', 'fileTree']);
  });

  test('appends tab dropped after other group tabs', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(strip('d'));
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e,f', 'fileTree']);
  });

  test('appends tab dropped on other group content', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(content('d'));
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e,f', 'fileTree']);
  });

  test('fills content of group that held tab joins', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(content('d'));
    expect(content('d').hasAttribute('data-drop-target')).toBe(true);
    expect(getComputedStyle(content('d'), '::after').backgroundColor).toBe(
      getComputedStyle(content('d'), '::after').getPropertyValue('--layer-selected'),
    );

    await drop(dockview);
    expect(fills()).toBe(0);
  });

  test('shows tab held after other group tabs as last tab', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(strip('d'));
    expect(fills()).toBe(0);
    expect(shown()).toContain('d,e,f,f');
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('keeps tab among tabs it was dragged over', async () => {
    const dockview = await mount();

    await hold('a', tab('d'));
    await move(content('d'));
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,d,e', 'b,c', 'f', 'fileTree']);
  });

  test('keeps tab dropped on own group content', async () => {
    const dockview = await mount();

    await hold('a', content('a'));
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('keeps tab dropped on file tree', async () => {
    const dockview = await mount();

    await hold('a', document.querySelector('.dv-groupview:has([data-tool]) .dv-content-container') as Element);
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test.each([
    ['left', 0.1, 0.5],
    ['right', 0.9, 0.5],
    ['above', 0.5, 0.1],
    ['below', 0.5, 0.9],
  ] as const)('splits group on %s side that tab is dropped near', async (side, across, down) => {
    const dockview = await mount();
    const whole = group('d').getBoundingClientRect();

    await hold('a', tab('b'));
    await move(content('d'), across, down);
    expect(content('d').getAttribute('data-drop-target')).toBe(side);
    const fill = getComputedStyle(content('d'), '::after');
    const filled = content('d').getBoundingClientRect();
    expect(Number.parseFloat(side === 'left' || side === 'right' ? fill.width : fill.height)).toBeCloseTo(
      (side === 'left' || side === 'right' ? filled.width : filled.height) / 2,
      0,
    );
    await drop(dockview);

    expect(model(dockview)).toEqual(['a', 'b,c', 'd,e', 'f', 'fileTree']);
    const split = group('a').getBoundingClientRect();
    const beside = group('d').getBoundingClientRect();
    expect({
      left: split.right <= beside.left + 1,
      right: split.left >= beside.right - 1,
      above: split.bottom <= beside.top + 1,
      below: split.top >= beside.bottom - 1,
    }).toMatchObject({ [side]: true });
    // The new group is as large as the fill.
    if (side === 'left' || side === 'right') {
      expect(split.width).toBeCloseTo(whole.width / 2, -1);
    } else {
      expect(split.height).toBeCloseTo(whole.height / 2, -1);
    }
    expect(fills()).toBe(0);
  });

  test('keeps content that tab is held over where it was scrolled', async () => {
    const dockview = await mount();
    const scrolled = document.createElement('div');
    scrolled.style.cssText = 'position: absolute; inset: 0; overflow: auto;';
    scrolled.innerHTML = '<div style="height: 4000px"></div>';
    content('d').append(scrolled);
    scrolled.scrollTop = 500;

    await hold('a', tab('b'));
    await move(content('d'), 0.5, 0.95);
    for (let held = 0; held < 5; held++) {
      dispatch('pointermove', document);
      await frames();
    }
    expect(scrolled.scrollTop).toBe(500);
    await cancel(dockview);
  });

  test('splits own group', async () => {
    const dockview = await mount();

    await hold('a', content('a'));
    await move(content('a'), 0.9, 0.5);
    expect(content('a').getAttribute('data-drop-target')).toBe('right');
    await drop(dockview);

    expect(model(dockview)).toEqual(['a', 'b,c', 'd,e', 'f', 'fileTree']);
    expect(group('a').getBoundingClientRect().left).toBeGreaterThanOrEqual(
      group('b').getBoundingClientRect().right - 1,
    );
  });

  test('keeps sole tab dropped near own content edge', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(content('f'), 0.9, 0.5);
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('clears half fill when cancelled', async () => {
    const dockview = await mount();

    await hold('a', tab('b'));
    await move(content('d'), 0.1, 0.5);
    expect(fills()).toBe(1);
    await cancel(dockview);

    expect(fills()).toBe(0);
    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('slides tabs left by tab held after other group tabs', async () => {
    const dockview = await mount();

    await hold('a', content('a'));
    expect(tab('b').getAnimations()).toHaveLength(0);
    const { x, y, width, height } = strip('d').getBoundingClientRect();
    Object.assign(pointer, { x: x + width / 2, y: y + height / 2 });
    dispatch('pointermove', document);
    await expect.poll(() => tab('b').getAnimations().length).toBeGreaterThan(0);
    await cancel(dockview);
  });

  test('keeps tab in group while pointer is in its strip', async () => {
    const dockview = await mount();
    const groups = () => shown().join(' ');

    await hold('e', strip('d'));
    const held = groups();
    const { right } = strip('d').getBoundingClientRect();
    for (let x = right - 30; x < right; x++) {
      Object.assign(pointer, { x, y: pointer.y });
      dispatch('pointermove', document);
      await frames();
      expect(groups()).toBe(held);
    }

    // The padding before the tabs of the group beside it.
    Object.assign(pointer, { x: tab('f').getBoundingClientRect().left - 2, y: pointer.y });
    dispatch('pointermove', document);
    await frames();
    expect(groups()).toBe(held);
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('moves tab whose centre is over other group tab', async () => {
    const dockview = await mount();

    const { x, y, height } = tab('e').getBoundingClientRect();
    Object.assign(pointer, { x: x + 3, y: y + height / 2 });
    dispatch('pointerdown', tab('e'));
    await frames();
    const to = tab('f').getBoundingClientRect();
    const held = tab('e').getBoundingClientRect().width / 2 - 3;
    // The pointer stays in the strip that the tab leaves.
    for (const at of [to.left - 30, to.left + 4 - held]) {
      Object.assign(pointer, { x: at, y: pointer.y });
      dispatch('pointermove', document);
      await frames();
    }
    expect(pointer.x).toBeLessThan(strip('d').getBoundingClientRect().right);
    await drop(dockview);

    expect(model(dockview)).toContain('d');
    expect(model(dockview).some((group) => group.includes('e') && group.includes('f'))).toBe(true);
  });

  test('keeps fill of dragged tab in other group', async () => {
    const dockview = await mount();
    const fill = () =>
      getComputedStyle(document.querySelector('.dv-tab[data-dnd-dragging]') as Element, '::before').backgroundImage;

    await hold('f', content('f'));
    const held = fill();
    expect(held).toContain('gradient');
    await move(tab('d'));
    expect(shown()).toContain('f,f,d,e');
    expect(fill()).toBe(held);
    await cancel(dockview);
  });

  test('shows no tab beside dropped tab', async () => {
    const dockview = await mount();
    const joined = tab('d').closest('.dv-scrollable') as HTMLElement;

    await hold('a', tab('d'));
    await frames();
    await frames();
    const { width } = joined.getBoundingClientRect();
    let widest = width;
    const observer = new MutationObserver(() => {
      widest = Math.max(widest, joined.getBoundingClientRect().width);
    });
    observer.observe(joined, { childList: true, subtree: true });
    await drop(dockview);
    observer.disconnect();

    expect(widest).toBe(width);
  });

  test('fits tab that joins from group beside', async () => {
    const dockview = await mount();
    const joined = tab('b').closest('.dv-scrollable') as HTMLElement;
    const tabs = joined.querySelector('.dv-tabs-container') as HTMLElement;

    await hold('f', content('f'));
    const { x, y, width, height } = tab('b').getBoundingClientRect();
    Object.assign(pointer, { x: x + width / 2, y: y + height / 2 });
    dispatch('pointermove', document);
    await expect.poll(() => shown()).toContain('a,f,f,b,c');
    for (let frame = 0; frame < 8; frame++) {
      expect(tabs.scrollWidth).toBeLessThanOrEqual(joined.clientWidth);
      expect(tabs.scrollHeight).toBeLessThanOrEqual(joined.clientHeight);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await drop(dockview);

    expect((joined.querySelector('.dv-scrollbar') as HTMLElement).style.width).toBe('0px');
  });

  test('restores sole tab of group when cancelled', async () => {
    const dockview = await mount();

    await hold('f', tab('d'));
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('restores last tab of group when cancelled', async () => {
    const dockview = await mount();

    await hold('c', tab('d'));
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('restores reordered tab when cancelled', async () => {
    const dockview = await mount();

    await hold('a', tab('c'));
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('clears fill when cancelled', async () => {
    const dockview = await mount();

    await hold('f', content('f'));
    await move(content('d'));
    expect(fills()).toBe(1);
    await cancel(dockview);

    expect(fills()).toBe(0);
    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('moves tabs after earlier move and cancel', async () => {
    const dockview = await mount();

    await hold('a', tab('d'));
    await drop(dockview);
    await hold('f', tab('e'));
    await cancel(dockview);
    await hold('b', tab('c'));
    await drop(dockview);
    await hold('e', tab('b'));
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,d', 'c,e,b', 'f', 'fileTree']);
  });

  test('splits group beside tabless panel dropped near its content edge', async () => {
    const dockview = await mount();
    const { width } = group('fileTree').getBoundingClientRect();

    await hold('fileTree', content('a'));
    await move(content('d'), 0.1, 0.5);
    expect(content('d').getAttribute('data-drop-target')).toBe('left');
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
    const moved = group('fileTree').getBoundingClientRect();
    expect(moved.right).toBeLessThanOrEqual(group('d').getBoundingClientRect().left + 1);
    expect(moved.height).toBeCloseTo(group('d').getBoundingClientRect().height, -1);
    // It keeps its width.
    expect(moved.width).toBeCloseTo(width, -1);
  });

  test('keeps tabless panel dropped on centre of group content', async () => {
    const dockview = await mount();
    const { left } = group('fileTree').getBoundingClientRect();

    await hold('fileTree', content('a'));
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
    expect(group('fileTree').getBoundingClientRect().left).toBe(left);
  });

  test('keeps tabless panel dropped among tabs', async () => {
    const dockview = await mount();

    await hold('fileTree', tab('b'));
    expect(shown()).toEqual(['a,b,c', 'd,e', 'f', 'fileTree', 'fileTree']);
    await move(strip('a'));
    expect(shown()).toEqual(['a,b,c', 'd,e', 'f', 'fileTree', 'fileTree']);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('drags tabless panel by space after its tab', async () => {
    const dockview = await mount();
    const { x, y, width, height } = strip('fileTree').getBoundingClientRect();
    Object.assign(pointer, { x: x + width / 2, y: y + height / 2 });

    dispatch('pointerdown', strip('fileTree'));
    await frames();
    await move(content('a'));
    const dragged = document.querySelector('[data-dnd-dragging]')?.getBoundingClientRect();
    expect(dragged?.width).toBeCloseTo(group('fileTree').getBoundingClientRect().width, -1);
    await move(content('d'), 0.1, 0.5);
    await drop(dockview);

    expect(group('fileTree').getBoundingClientRect().right).toBeLessThanOrEqual(
      group('d').getBoundingClientRect().left + 1,
    );
  });

  test('sizes tabless panel anew when moved from below groups to beside one', async () => {
    const dockview = await mount();
    const root = tab('a').closest('.dv-dockview') as HTMLElement;
    await hold('fileTree', content('a'));
    await move(root, 0.25, 0.99);
    await drop(dockview);
    expect(group('fileTree').getBoundingClientRect().width).toBeCloseTo(root.getBoundingClientRect().width, -1);
    const { width } = group('a').getBoundingClientRect();

    await hold('fileTree', content('fileTree'));
    await move(content('a'), 0.1, 0.5);
    await drop(dockview);

    expect(group('fileTree').getBoundingClientRect().width).toBeCloseTo(width / 2, -1);
  });

  test('keeps height of tabless panel moved from below groups to above one', async () => {
    const dockview = await mount();
    const root = tab('a').closest('.dv-dockview') as HTMLElement;
    await hold('fileTree', content('a'));
    await move(root, 0.25, 0.99);
    await drop(dockview);
    const { height } = group('fileTree').getBoundingClientRect();

    await hold('fileTree', content('fileTree'));
    await move(content('d'), 0.5, 0.1);
    await drop(dockview);

    expect(group('fileTree').getBoundingClientRect().bottom).toBeLessThanOrEqual(
      group('d').getBoundingClientRect().top + 1,
    );
    expect(group('fileTree').getBoundingClientRect().height).toBeCloseTo(height, -1);
  });

  test('keeps sole tab among tabs it shows in when dropped near own content edge', async () => {
    const dockview = await mount();
    const own = content('f');

    await hold('f', tab('d'));
    await move(own, 0.9, 0.5);
    expect(fills()).toBe(0);
    await drop(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'f,d,e', 'fileTree']);
  });

  test('leaves group that is dragged by space after its tabs', async () => {
    const dockview = await mount();
    await mouse('mouseMoved', strip('a'), false);
    await mouse('mousePressed', strip('a'), true);
    await mouse('mouseMoved', content('a'), true);
    await mouse('mouseMoved', content('d'), true);
    await frames();
    expect(document.querySelector('.dv-drop-target-dropzone, [data-dnd-dragging]')).toBeNull();
    await mouse('mouseReleased', content('d'), false);
    await frames();

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });
});
