import type { AddPanelOptions, DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../../test/dock';
import { STUB_PANELS } from '../../../../../../../test/dock-stubs';
import { DefaultTab, FileTreeTab, WorkspaceDock } from '../route';

import 'dockview-react/dist/styles/dockview.css';
import '../../../../dockview.css';

const TABS = { fileTree: FileTreeTab, file: DefaultTab, terminal: DefaultTab };

// Mounts an active dock with a, b and c in one group, d and e in a group below, and f alone in a group beside them.
async function mount() {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  let api: DockviewApi | undefined;
  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          panels={STUB_PANELS}
          tabs={TABS}
          onDockviewReady={(ready) => {
            api = ready;
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());

  const dockview = api as DockviewApi;
  const add = (id: string, position: AddPanelOptions['position']) =>
    dockview.addPanel({ id, component: 'file', tabComponent: 'file', title: id, position });
  add('a', { referencePanel: 'fileTree', direction: 'left' });
  add('b', { referencePanel: 'a', direction: 'within' });
  add('c', { referencePanel: 'a', direction: 'within' });
  add('d', { referencePanel: 'a', direction: 'below' });
  add('e', { referencePanel: 'd', direction: 'within' });
  add('f', { referencePanel: 'd', direction: 'right' });
  await frames();
  return dockview;
}

// The ids of each group's panels in order, as the dock has them.
const model = (dockview: DockviewApi) =>
  dockview.groups.map((group) => group.panels.map((panel) => panel.id).join()).sort();

// The panel ids of every tab element in each strip, placeholders and leftovers included.
const shown = () =>
  [...document.querySelectorAll('.dv-tabs-container')]
    .map((strip) =>
      [...strip.querySelectorAll<HTMLElement>('.dv-tab')].map((tab) => tab.dataset.tabPanelId ?? '?').join(),
    )
    .sort();

const tab = (id: string) => document.querySelector(`.dv-tab[data-tab-panel-id="${id}"]`) as HTMLElement;

// The space after the tabs of the group that has the tab `id`.
const strip = (id: string) => tab(id).closest('.dv-groupview')?.querySelector('.dv-void-container') as HTMLElement;

const content = (id: string) => tab(id).closest('.dv-groupview')?.querySelector('.dv-content-container') as HTMLElement;

const group = (id: string) => tab(id).closest('.dv-groupview') as HTMLElement;

const fills = () => document.querySelectorAll('[data-drop-target]').length;

// The drag follows the pointer once a frame, and each tab that slides aside takes a few more.
async function frames() {
  for (let frame = 0; frame < 6; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let pointer = { x: 0, y: 0 };

function dispatch(type: string, target: EventTarget) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: pointer.x,
      clientY: pointer.y,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  );
}

// Moves the pressed pointer to the middle of `to`, or as far across it as `across` and down it as `down`.
async function move(to: Element, across = 0.5, down = 0.5) {
  const { x, y, width, height } = to.getBoundingClientRect();
  const from = pointer;
  for (let step = 1; step <= 5; step++) {
    pointer = {
      x: from.x + ((x + width * across - from.x) * step) / 5,
      y: from.y + ((y + height * down - from.y) * step) / 5,
    };
    dispatch('pointermove', document);
    await frames();
  }
}

// Drags the tab `id` over `to` and holds it there.
async function hold(id: string, to: Element) {
  const { x, y, width, height } = tab(id).getBoundingClientRect();
  pointer = { x: x + width / 2, y: y + height / 2 };
  dispatch('pointerdown', tab(id));
  await frames();
  await move(to);
}

// Waits for the dropped or cancelled tab to settle, and expects the strips to show the dock's tabs.
async function settled(dockview: DockviewApi) {
  await expect.poll(() => document.querySelectorAll('[data-dnd-placeholder], [data-dnd-dragging]').length).toBe(0);
  await frames();
  expect(shown()).toEqual(model(dockview));
}

async function drop(dockview: DockviewApi) {
  // A tab that slid aside is only found under the pointer once the pointer moves again.
  dispatch('pointermove', document);
  await frames();
  dispatch('pointerup', document.body);
  await settled(dockview);
}

async function cancel(dockview: DockviewApi) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settled(dockview);
}

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
    // The split group takes the half that was filled.
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
    pointer = { x: x + width / 2, y: y + height / 2 };
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
      pointer = { x, y: pointer.y };
      dispatch('pointermove', document);
      await frames();
      expect(groups()).toBe(held);
    }

    // The padding before the tabs of the group beside it.
    pointer = { x: tab('f').getBoundingClientRect().left - 2, y: pointer.y };
    dispatch('pointermove', document);
    await frames();
    expect(groups()).toBe(held);
    await cancel(dockview);

    expect(model(dockview)).toEqual(['a,b,c', 'd,e', 'f', 'fileTree']);
  });

  test('moves tab whose centre is over other group tab', async () => {
    const dockview = await mount();

    const { x, y, height } = tab('e').getBoundingClientRect();
    pointer = { x: x + 3, y: y + height / 2 };
    dispatch('pointerdown', tab('e'));
    await frames();
    const to = tab('f').getBoundingClientRect();
    const held = tab('e').getBoundingClientRect().width / 2 - 3;
    // The pointer stays in the strip that the tab leaves.
    for (const at of [to.left - 30, to.left + 4 - held]) {
      pointer = { x: at, y: pointer.y };
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

  test('resizes strip with tabs that slide', async () => {
    const dockview = await mount();
    const left = tab('b').closest('.dv-scrollable') as HTMLElement;
    const joined = tab('d').closest('.dv-scrollable') as HTMLElement;
    const actions = left.parentElement?.querySelector('.dv-left-actions-container') as HTMLElement;
    const widths = [left.getBoundingClientRect().width, joined.getBoundingClientRect().width];
    const from = actions.getBoundingClientRect().left;

    await hold('a', content('a'));
    const { x, y, width, height } = tab('d').getBoundingClientRect();
    pointer = { x: x + width / 2, y: y + height / 2 };
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

  test('fits strip to tab that returns when cancelled', async () => {
    const dockview = await mount();
    const left = tab('b').closest('.dv-scrollable') as HTMLElement;
    const { width } = left.getBoundingClientRect();

    // The strip is still narrowing.
    await hold('a', tab('d'));
    await cancel(dockview);

    expect(left.getBoundingClientRect().width).toBe(width);
  });

  test('fits tab that joins from group beside', async () => {
    const dockview = await mount();
    const joined = tab('b').closest('.dv-scrollable') as HTMLElement;
    const tabs = joined.querySelector('.dv-tabs-container') as HTMLElement;

    await hold('f', content('f'));
    const { x, y, width, height } = tab('b').getBoundingClientRect();
    pointer = { x: x + width / 2, y: y + height / 2 };
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
});
