import { describe, expect, test } from 'vitest';
import { cancel, content, dispatch, drop, hold, mount, pointer, tab } from '../../../../../../../test/dock-drag';

describe('DroppableGroup', () => {
  test('resizes strip with tabs that slide', async () => {
    const dockview = await mount();
    const left = tab('b').closest('.dv-scrollable') as HTMLElement;
    const joined = tab('d').closest('.dv-scrollable') as HTMLElement;
    const actions = left.parentElement?.querySelector('.dv-left-actions-container') as HTMLElement;
    const widths = [left.getBoundingClientRect().width, joined.getBoundingClientRect().width];
    const from = actions.getBoundingClientRect().left;

    await hold('a', content('a'));
    const { x, y, width, height } = tab('d').getBoundingClientRect();
    Object.assign(pointer, { x: x + width / 2, y: y + height / 2 });
    dispatch('pointermove', document);
    await expect.poll(() => left.getAnimations().length + joined.getAnimations().length).toBe(2);
    for (let frame = 0; frame < 6; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // No tab slides out of the strip, and no strip is narrower than its tabs.
      expect(tab('c').getBoundingClientRect().right).toBeLessThanOrEqual(left.getBoundingClientRect().right);
      expect(tab('e').getBoundingClientRect().right).toBeLessThanOrEqual(joined.getBoundingClientRect().right);
      for (const strip of [left, joined]) {
        expect(strip.querySelector('.dv-tabs-container')?.scrollWidth).toBeLessThanOrEqual(strip.clientWidth);
      }
    }
    expect(actions.getBoundingClientRect().left).toBeLessThan(from);
    expect(left.getBoundingClientRect().width).toBeGreaterThan(widths[1]);
    expect(document.querySelector('[class*="overflow-dropdown"]')).toBeNull();

    await drop(dockview);
    expect(left.getBoundingClientRect().width).toBeCloseTo(widths[1], 0);
    expect(joined.getBoundingClientRect().width).toBeCloseTo(widths[0], 0);
    for (const scrollbar of document.querySelectorAll<HTMLElement>('.dv-scrollbar')) {
      expect(scrollbar.style.width).toBe('0px');
    }
  });

  test('fits strip to tab that returns when cancelled', async () => {
    const dockview = await mount();
    const left = tab('b').closest('.dv-scrollable') as HTMLElement;
    const { width } = left.getBoundingClientRect();

    // The strip is still narrowing.
    await hold('a', tab('d'));
    await cancel(dockview);

    expect(left.getBoundingClientRect().width).toBe(width);
  });
});
