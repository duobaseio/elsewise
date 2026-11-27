import type { Panel } from '@elsewise/frontend-plugin';
import { describe, expect, test, vi } from 'vitest';
import { builtInApplication } from '../../test/commands';
import { addTerminal, FILE, FILE_TREE, mount as mountDock, TERMINAL, WORKSPACE } from '../../test/dock';
import {
  PANEL_CLOSE,
  PANEL_CLOSE_ALL,
  PANEL_CLOSE_LEFT,
  PANEL_CLOSE_OTHERS,
  PANEL_CLOSE_RIGHT,
  PANEL_SPLIT_MOVE_DOWN,
  PANEL_SPLIT_MOVE_RIGHT,
} from './commands';
import { DockManager } from './dock-manager';
import type { PanelComponent } from './panel-component';

const SECOND = { ...FILE, id: 'file:second.ts', relativePath: 'second.ts' };
const THIRD = { ...FILE, id: 'file:third.ts', relativePath: 'third.ts' };

// An application whose shown dock has the file, a second and a third in a group, above the terminal and beside the file
// tree. Its file component has `close`.
async function mount(close?: PanelComponent['close']) {
  const dockview = await mountDock();
  for (const file of [SECOND, THIRD]) {
    dockview.addPanel({
      id: file.id,
      component: 'file',
      params: { path: file.relativePath },
      position: { referencePanel: FILE.id },
    });
  }
  addTerminal(dockview);
  dockview.getPanel(FILE.id)?.api.setActive();

  const application = builtInApplication({
    panelComponents: [
      { type: 'file', header: () => null, panel: () => null, close },
      { type: 'terminal', header: () => null, panel: () => null },
    ],
  });
  const dock = new DockManager(
    WORKSPACE,
    dockview,
    application,
    () => {},
    () => {},
    () => {},
  );
  application.docks.active = dock;

  // A panel that is alone in its group and can be closed.
  application.docks.addPanelSources([
    { id: 'example/tool', label: 'Tool', tab: false, closable: true, header: () => null, panel: () => null },
  ]);
  const tool = dock.addPanel('example/tool', { edge: 'bottom' }, false);
  if (tool === null) {
    throw new Error('tool not added');
  }
  return { application, dock, tool };
}

const ids = (panels: readonly Panel[] | undefined) => panels?.map((panel) => panel.id);

describe('PANEL_CLOSE', () => {
  test('shows and enables for closable panel only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_CLOSE.shown, PANEL_CLOSE.enabled]) {
      expect(check?.(application, FILE)).toBe(true);
      expect(check?.(application, tool)).toBe(true);
      expect(check?.(application, FILE_TREE)).toBe(false);
    }
  });

  test('closes panel', async () => {
    const { application, dock } = await mount();

    expect(PANEL_CLOSE.run(application, SECOND)).toBe(true);

    await vi.waitFor(() => expect(ids(dock.groups[0]?.panels)).toEqual([FILE.id, THIRD.id]));
  });

  test('keeps panel that refuses', async () => {
    const close = vi.fn(() => false);
    const { application, dock } = await mount(close);

    PANEL_CLOSE.run(application, SECOND);

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(dock.get(SECOND.id)).toEqual(SECOND);
  });
});

describe('PANEL_CLOSE_OTHERS', () => {
  test('shows for tab panel only', async () => {
    const { application, tool } = await mount();

    expect(PANEL_CLOSE_OTHERS.shown?.(application, FILE)).toBe(true);
    expect(PANEL_CLOSE_OTHERS.shown?.(application, TERMINAL)).toBe(true);
    expect(PANEL_CLOSE_OTHERS.shown?.(application, tool)).toBe(false);
  });

  test('enables with other closable tab in group', async () => {
    const { application, tool } = await mount();

    expect(PANEL_CLOSE_OTHERS.enabled?.(application, FILE)).toBe(true);
    expect(PANEL_CLOSE_OTHERS.enabled?.(application, TERMINAL)).toBe(false);
    expect(PANEL_CLOSE_OTHERS.enabled?.(application, tool)).toBe(false);
  });

  test('closes other tabs of group', async () => {
    const { application, dock } = await mount();

    expect(PANEL_CLOSE_OTHERS.run(application, SECOND)).toBe(true);

    await vi.waitFor(() => expect(ids(dock.groups[0]?.panels)).toEqual([SECOND.id]));
    expect(dock.get(TERMINAL.id)).toEqual(TERMINAL);
  });

  test('continues past panel that refuses', async () => {
    const { application, dock } = await mount((_, __, panel) => panel.id !== FILE.id);

    PANEL_CLOSE_OTHERS.run(application, SECOND);

    await vi.waitFor(() => expect(ids(dock.groups[0]?.panels)).toEqual([FILE.id, SECOND.id]));
  });

  test('asks one panel at a time', async () => {
    const asked: string[] = [];
    const allow: (() => void)[] = [];
    const { application } = await mount((_, __, panel) => {
      asked.push(panel.id);
      return new Promise<boolean>((resolve) => allow.push(() => resolve(true)));
    });

    PANEL_CLOSE_OTHERS.run(application, SECOND);

    await vi.waitFor(() => expect(asked).toEqual([FILE.id]));
    allow[0]?.();
    await vi.waitFor(() => expect(asked).toEqual([FILE.id, THIRD.id]));
  });
});

describe('PANEL_CLOSE_ALL', () => {
  test('shows and enables for tab panel only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_CLOSE_ALL.shown, PANEL_CLOSE_ALL.enabled]) {
      expect(check?.(application, FILE)).toBe(true);
      expect(check?.(application, TERMINAL)).toBe(true);
      expect(check?.(application, tool)).toBe(false);
    }
  });

  test('closes tabs of group', async () => {
    const { application, dock } = await mount();

    expect(PANEL_CLOSE_ALL.run(application, SECOND)).toBe(true);

    await vi.waitFor(() => expect(dock.panels.filter((panel) => panel.type === 'file')).toEqual([]));
    expect(dock.get(TERMINAL.id)).toEqual(TERMINAL);
  });
});

describe('PANEL_CLOSE_LEFT', () => {
  test('shows and enables with closable tab before panel only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_CLOSE_LEFT.shown, PANEL_CLOSE_LEFT.enabled]) {
      expect(check?.(application, SECOND)).toBe(true);
      expect(check?.(application, FILE)).toBe(false);
      expect(check?.(application, tool)).toBe(false);
    }
  });

  test('closes tabs before panel', async () => {
    const { application, dock } = await mount();

    expect(PANEL_CLOSE_LEFT.run(application, THIRD)).toBe(true);

    await vi.waitFor(() => expect(ids(dock.groups[0]?.panels)).toEqual([THIRD.id]));
  });
});

describe('PANEL_CLOSE_RIGHT', () => {
  test('shows and enables with closable tab after panel only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_CLOSE_RIGHT.shown, PANEL_CLOSE_RIGHT.enabled]) {
      expect(check?.(application, SECOND)).toBe(true);
      expect(check?.(application, THIRD)).toBe(false);
      expect(check?.(application, tool)).toBe(false);
    }
  });

  test('closes tabs after panel', async () => {
    const { application, dock } = await mount();

    expect(PANEL_CLOSE_RIGHT.run(application, FILE)).toBe(true);

    await vi.waitFor(() => expect(ids(dock.groups[0]?.panels)).toEqual([FILE.id]));
  });
});

describe('PANEL_SPLIT_MOVE_RIGHT', () => {
  test('shows and enables with other tab in group only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_SPLIT_MOVE_RIGHT.shown, PANEL_SPLIT_MOVE_RIGHT.enabled]) {
      expect(check?.(application, FILE)).toBe(true);
      expect(check?.(application, TERMINAL)).toBe(false);
      expect(check?.(application, tool)).toBe(false);
    }
  });

  test('moves panel to new group right of its group', async () => {
    const { application, dock, tool } = await mount();

    expect(PANEL_SPLIT_MOVE_RIGHT.run(application, SECOND)).toBe(true);

    expect(dock.layout).toMatchObject({
      children: [
        {
          children: [
            {
              direction: 'column',
              children: [
                { direction: 'row', children: [{ panels: [FILE, THIRD] }, { panels: [SECOND] }] },
                { panels: [TERMINAL] },
              ],
            },
            { panels: [FILE_TREE] },
          ],
        },
        { panels: [tool] },
      ],
    });
  });
});

describe('PANEL_SPLIT_MOVE_DOWN', () => {
  test('shows and enables with other tab in group only', async () => {
    const { application, tool } = await mount();

    for (const check of [PANEL_SPLIT_MOVE_DOWN.shown, PANEL_SPLIT_MOVE_DOWN.enabled]) {
      expect(check?.(application, FILE)).toBe(true);
      expect(check?.(application, TERMINAL)).toBe(false);
      expect(check?.(application, tool)).toBe(false);
    }
  });

  test('moves panel to new group below its group', async () => {
    const { application, dock, tool } = await mount();

    expect(PANEL_SPLIT_MOVE_DOWN.run(application, SECOND)).toBe(true);

    expect(dock.layout).toMatchObject({
      children: [
        {
          children: [
            {
              direction: 'column',
              children: [{ panels: [FILE, THIRD] }, { panels: [SECOND] }, { panels: [TERMINAL] }],
            },
            { panels: [FILE_TREE] },
          ],
        },
        { panels: [tool] },
      ],
    });
  });
});
