import type { Layout, Panel, Placement, TablessPanel, TabPanel } from '@elsewise/frontend-plugin';
import { describe, expect, test } from 'vitest';
import { mount as mountDock, WORKSPACE } from '../../test/dock';
import { DockStore } from './dock-store';
import { addPanel, movePanel } from './placement';

const EDITOR = 'editor:$workspace.tsx';

// A dock whose first group has the tabs editor, a, b and c, beside the file tree's.
async function mount() {
  const dockview = await mountDock();
  for (const id of ['a', 'b', 'c']) {
    dockview.addPanel({ id, component: 'terminal', params: { session: id }, position: { referencePanel: EDITOR } });
  }
  const { panels } = new DockStore(WORKSPACE, dockview).snapshot;
  const ids = (layout: Layout | null): unknown => {
    if (layout === null) {
      return null;
    }
    return 'children' in layout
      ? { [layout.direction]: layout.children.map(ids) }
      : layout.panels.map((panel) => panel.id);
  };

  return {
    tab: (id: string) => panels.find((panel) => panel.id === id) as TabPanel,
    fileTree: panels.find((panel) => panel.id === 'fileTree') as TablessPanel,
    add: (placement: Placement) =>
      addPanel(dockview, panels, { id: 'n', component: 'terminal', params: { session: 'n' } }, placement)?.id ?? null,
    move: (moved: Panel, placement: Placement) => movePanel(dockview, panels, moved, placement),
    // The ids of each group's panels, in the splits that hold them.
    layout: () => ids(new DockStore(WORKSPACE, dockview).snapshot.layout),
  };
}

describe('addPanel', () => {
  test('adds tab before panel', async () => {
    const { tab, add, layout } = await mount();

    expect(add({ tab: 'before', of: tab('b') })).toBe('n');
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'n', 'b', 'c'], ['fileTree']] });
  });

  test('adds tab after panel', async () => {
    const { tab, add, layout } = await mount();

    add({ tab: 'after', of: tab('b') });

    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'n', 'c'], ['fileTree']] });
  });

  test('adds tab first in group', async () => {
    const { tab, add, layout } = await mount();

    add({ tab: 'first', with: tab('b') });

    expect(layout()).toEqual({ row: [['n', EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });

  test('adds tab last in group', async () => {
    const { tab, add, layout } = await mount();

    add({ tab: 'last', with: tab('a') });

    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c', 'n'], ['fileTree']] });
  });

  test('adds group beside group of panel', async () => {
    const { fileTree, add, layout } = await mount();

    add({ group: 'above', of: fileTree });

    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], { column: [['n'], ['fileTree']] }] });
  });

  test('adds group along edge', async () => {
    const { add, layout } = await mount();

    add({ edge: 'bottom' });

    expect(layout()).toEqual({ column: [{ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] }, ['n']] });
  });

  test('returns null for panel that is not open', async () => {
    const { tab, add, layout } = await mount();

    expect(add({ tab: 'after', of: { ...tab('b'), id: 'closed' } })).toBeNull();
    expect(add({ group: 'right', of: { ...tab('b'), id: 'closed' } })).toBeNull();
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });

  test('returns null for tab in group of tabless panel', async () => {
    const { fileTree, add, layout } = await mount();

    expect(add({ tab: 'last', with: fileTree as unknown as TabPanel })).toBeNull();
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });
});

describe('movePanel', () => {
  test('moves tab after later panel', async () => {
    const { tab, move, layout } = await mount();

    expect(move(tab('a'), { tab: 'after', of: tab('b') })).toBe(true);
    expect(layout()).toEqual({ row: [[EDITOR, 'b', 'a', 'c'], ['fileTree']] });
  });

  test('moves tab before earlier panel', async () => {
    const { tab, move, layout } = await mount();

    move(tab('c'), { tab: 'before', of: tab('a') });

    expect(layout()).toEqual({ row: [[EDITOR, 'c', 'a', 'b'], ['fileTree']] });
  });

  test('moves tab first in group', async () => {
    const { tab, move, layout } = await mount();

    move(tab('b'), { tab: 'first', with: tab('c') });

    expect(layout()).toEqual({ row: [['b', EDITOR, 'a', 'c'], ['fileTree']] });
  });

  test('moves tab last in group', async () => {
    const { tab, move, layout } = await mount();

    move(tab('a'), { tab: 'last', with: tab('a') });

    expect(layout()).toEqual({ row: [[EDITOR, 'b', 'c', 'a'], ['fileTree']] });
  });

  test('moves tab to new group beside group of panel', async () => {
    const { tab, move, layout } = await mount();

    move(tab('c'), { group: 'below', of: tab('b') });

    expect(layout()).toEqual({ row: [{ column: [[EDITOR, 'a', 'b'], ['c']] }, ['fileTree']] });
  });

  test('moves tab to other group', async () => {
    const { tab, move, layout } = await mount();
    move(tab('c'), { group: 'below', of: tab('b') });

    move(tab('a'), { tab: 'before', of: tab('c') });

    expect(layout()).toEqual({
      row: [
        {
          column: [
            [EDITOR, 'b'],
            ['a', 'c'],
          ],
        },
        ['fileTree'],
      ],
    });
  });

  test('moves tab to new group along edge', async () => {
    const { tab, move, layout } = await mount();

    move(tab('c'), { edge: 'top' });

    expect(layout()).toEqual({ column: [['c'], { row: [[EDITOR, 'a', 'b'], ['fileTree']] }] });
  });

  test('moves tabless panel beside group of panel', async () => {
    const { tab, fileTree, move, layout } = await mount();

    move(fileTree, { group: 'left', of: tab('b') });

    expect(layout()).toEqual({ row: [['fileTree'], [EDITOR, 'a', 'b', 'c']] });
  });

  test('returns false for panel that is not open', async () => {
    const { tab, move, layout } = await mount();

    expect(move(tab('a'), { tab: 'after', of: { ...tab('b'), id: 'closed' } })).toBe(false);
    expect(move({ ...tab('a'), id: 'closed' }, { tab: 'after', of: tab('b') })).toBe(false);
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });

  test('returns false for tab in group of tabless panel', async () => {
    const { tab, fileTree, move, layout } = await mount();

    expect(move(tab('a'), { tab: 'last', with: fileTree as unknown as TabPanel })).toBe(false);
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });

  test('returns false for tabless panel among tabs', async () => {
    const { tab, fileTree, move, layout } = await mount();

    expect(move(fileTree, { tab: 'last', with: tab('b') })).toBe(false);
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });

  test('returns false for panel before or after itself', async () => {
    const { tab, move, layout } = await mount();

    expect(move(tab('b'), { tab: 'after', of: tab('b') })).toBe(false);
    expect(layout()).toEqual({ row: [[EDITOR, 'a', 'b', 'c'], ['fileTree']] });
  });
});
