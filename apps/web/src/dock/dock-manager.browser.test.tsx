import {
  type CloseActivation,
  DEFAULT_FRONTEND_SETTINGS,
  type Panel,
  type TerminalPanel,
} from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminals/terminal-manager';
import { builtInApplication } from '../../test/commands';
import { addTerminal, FILE, FILE_TREE, mount as mountDock, TERMINAL, WORKSPACE } from '../../test/dock';
import { DockManager } from './dock-manager';
import type { PanelComponent } from './panel-component';

const OTHER = { ...FILE, id: 'file:other.ts', relativePath: 'other.ts' };

// A dock that has the file and another in a group, above the terminal and beside the file tree. Its file and terminal
// components have `close`.
async function mount(close?: PanelComponent['close'], closeActivation: CloseActivation = 'left') {
  const dockview = await mountDock();
  dockview.addPanel({
    id: OTHER.id,
    component: 'file',
    params: { path: OTHER.relativePath },
    position: { referencePanel: FILE.id },
  });
  addTerminal(dockview);
  dockview.getPanel(FILE.id)?.api.setActive();

  const terminals = new TerminalManager(new QueryClient());
  const deleted = vi.spyOn(terminals, 'delete').mockResolvedValue();
  const created = vi
    .spyOn(terminals.store, 'add')
    .mockResolvedValue({ id: { ...WORKSPACE, session: '2' }, name: 'Terminal', state: 'idle' } as never);
  const application = builtInApplication({
    settings: new SettingsPanelManager([], {
      ...DEFAULT_FRONTEND_SETTINGS,
      workspace: { ...DEFAULT_FRONTEND_SETTINGS.workspace, closeActivation },
    }),
    terminals,
    panelComponents: [
      { type: 'file', header: () => null, panel: () => null, close },
      { type: 'terminal', header: () => null, panel: () => null, close },
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
  return { application, dock, dockview, created, deleted };
}

const ADDED = { ...TERMINAL, id: 'terminal:2', session: { ...WORKSPACE, session: '2' } };

describe('addFile', () => {
  test('adds and activates panel of file', async () => {
    const { dock } = await mount();

    const panel = dock.addFile('src/new.ts', { tab: 'after', of: FILE });

    expect(panel).toEqual({ ...FILE, id: panel?.id, relativePath: 'src/new.ts' });
    expect(dock.groups[0]).toEqual({ panels: [FILE, panel, OTHER], shown: panel });
    expect(dock.activePanel).toEqual(panel);
  });

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    const panel = dock.addFile('src/new.ts', { tab: 'first', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [panel, TERMINAL], shown: panel });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('activates panel of open file', async () => {
    const { dock } = await mount();

    expect(dock.addFile(OTHER.relativePath, { edge: 'top' })).toEqual(OTHER);

    expect(dock.panels).toHaveLength(4);
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('returns null for panel that is not open', async () => {
    const { dock } = await mount();

    expect(dock.addFile('src/new.ts', { tab: 'after', of: { ...OTHER, id: 'closed' } })).toBeNull();

    expect(dock.panels).toHaveLength(4);
  });
});

describe('addTerminal', () => {
  test('keeps close confirmation of panel', async () => {
    const { dock } = await mount();

    const panel = await dock.addTerminal({ closeConfirmation: true }, { tab: 'after', of: TERMINAL });

    expect(panel).toEqual({ ...ADDED, closeConfirmation: true });
    expect(dock.get(ADDED.id)).toEqual({ ...ADDED, closeConfirmation: true });
  });

  test('adds terminal and activates panel', async () => {
    const { dock, created } = await mount();

    await expect(dock.addTerminal({ name: 'x' }, { tab: 'last', with: OTHER })).resolves.toEqual(ADDED);

    expect(created).toHaveBeenCalledExactlyOnceWith(WORKSPACE, { name: 'x' });
    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER, ADDED], shown: ADDED });
    expect(dock.activePanel).toEqual(ADDED);
  });

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    await dock.addTerminal({}, { group: 'right', of: TERMINAL }, false);

    expect(dock.groups[2]).toEqual({ panels: [ADDED], shown: ADDED });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('returns null without terminal for panel that is not open', async () => {
    const { dock, created } = await mount();

    await expect(dock.addTerminal({}, { tab: 'last', with: { ...OTHER, id: 'closed' } })).resolves.toBeNull();

    expect(created).not.toHaveBeenCalled();
  });

  test('deletes terminal that cannot be placed', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.addTerminal({}, { tab: 'last', with: FILE_TREE })).resolves.toBeNull();

    expect(deleted).toHaveBeenCalledExactlyOnceWith(ADDED.session);
    expect(dock.panels).toHaveLength(4);
  });

  test('deletes terminal created after dock is disposed', async () => {
    const { dock, dockview, created, deleted } = await mount();
    const { promise, resolve } = Promise.withResolvers<never>();
    created.mockReturnValue(promise);

    const added = dock.addTerminal({}, { edge: 'bottom' });
    dock.dispose();
    resolve({ id: ADDED.session, name: 'Terminal' } as never);

    await expect(added).resolves.toBeNull();
    expect(deleted).toHaveBeenCalledExactlyOnceWith(ADDED.session);
    expect(dockview.getPanel(ADDED.id)).toBeUndefined();
  });

  test('rejects when terminal is not created', async () => {
    const { dock, created } = await mount();
    created.mockRejectedValue(new Error('unreachable'));

    await expect(dock.addTerminal({}, { edge: 'bottom' })).rejects.toThrow('unreachable');

    expect(dock.panels).toHaveLength(4);
  });
});

const REPORT = {
  id: 'example/report',
  label: 'Report',
  tab: true,
  closable: true,
  header: () => null,
  panel: () => null,
} as const;
const TOOL = {
  id: 'example/tool',
  label: 'Tool',
  tab: false,
  closable: false,
  header: () => null,
  panel: () => null,
} as const;

describe('addPanel', () => {
  test('adds and activates panel of source', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([REPORT]);

    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    expect(panel).toEqual({ id: expect.stringMatching(/^custom:/), type: 'example/report', tab: true, closable: true });
    expect(dock.groups[0]?.panels).toEqual([FILE, panel, OTHER]);
    expect(dock.activePanel).toEqual(panel);
  });

  test('shows panel without activating it', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([REPORT]);

    const panel = dock.addPanel(REPORT.id, { tab: 'first', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [panel, TERMINAL], shown: panel });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('adds tabless panel in group of its own', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([TOOL]);

    const panel = dock.addPanel(TOOL.id, { edge: 'bottom' });

    expect(panel).toEqual({ id: expect.stringMatching(/^custom:/), type: 'example/tool', tab: false, closable: false });
    expect(dock.groups.at(-1)).toEqual({ panels: [panel], shown: panel });
  });

  test('returns null for source that was not added', async () => {
    const { dock } = await mount();

    expect(dock.addPanel(REPORT.id, { tab: 'after', of: FILE })).toBeNull();
    expect(dock.panels).toHaveLength(4);
  });

  test('returns null for panel that is not open', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([REPORT]);

    expect(dock.addPanel(REPORT.id, { tab: 'after', of: { ...OTHER, id: 'closed' } })).toBeNull();
  });

  test('returns null for tabless panel among tabs', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([TOOL]);

    expect(dock.addPanel(TOOL.id, { tab: 'after', of: FILE })).toBeNull();
    expect(dock.panels).toHaveLength(4);
  });
});

describe('move', () => {
  test('moves panel and activates it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { tab: 'first', with: TERMINAL });

    expect(dock.groups).toEqual([
      { panels: [FILE], shown: FILE },
      { panels: [OTHER, TERMINAL], shown: OTHER },
      { panels: [FILE_TREE], shown: FILE_TREE },
    ]);
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { tab: 'last', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('moves panel to edge without activating it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { edge: 'top' }, false);

    expect(dock.groups[0]).toEqual({ panels: [OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('keeps moved panel active', async () => {
    const { dock } = await mount();

    dock.move(FILE, { tab: 'last', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, FILE], shown: FILE });
    expect(dock.activePanel).toEqual(FILE);
  });

  test('shows hidden group that panel moves to', async () => {
    const { dock } = await mount();
    dock.hide(TERMINAL);

    dock.move(OTHER, { tab: 'last', with: TERMINAL });

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('ignores panel that is not open', async () => {
    const { dock } = await mount();
    const groups = dock.groups;

    dock.move({ ...OTHER, id: 'closed' }, { edge: 'top' });

    expect(dock.groups).toEqual(groups);
  });
});

describe('moveFiles', () => {
  test('points panel at moved file', async () => {
    const { dock, dockview } = await mount();

    dock.moveFiles('other.ts', 'src/index.ts');

    expect(dock.get(OTHER.id)).toEqual({ ...OTHER, relativePath: 'src/index.ts' });
    expect(dockview.getPanel(OTHER.id)?.title).toBe('index.ts');
    expect(dock.get(FILE.id)).toEqual(FILE);
  });

  test('points panels under moved folder', async () => {
    const { dock, dockview } = await mount();

    dock.moveFiles('apps/web/', 'web/');

    expect(dock.get(FILE.id)).toEqual({
      ...FILE,
      relativePath: 'web/src/routes/_shell/$daemon/$project/$workspace.tsx',
    });
    expect(dockview.getPanel(FILE.id)?.title).toBe('$workspace.tsx');
    expect(dock.get(OTHER.id)).toEqual(OTHER);
  });

  test('closes panel already at destination', async () => {
    const { dock } = await mount();

    dock.moveFiles('other.ts', FILE.relativePath);

    expect(dock.get(FILE.id)).toBeNull();
    expect(dock.get(OTHER.id)).toEqual({ ...OTHER, relativePath: FILE.relativePath });
  });

  test('moves handles of files', async () => {
    const { application, dock } = await mount();
    const moved = vi.spyOn(application.files, 'move');

    dock.moveFiles('other.ts', 'index.ts');

    expect(moved).toHaveBeenCalledExactlyOnceWith(WORKSPACE, 'other.ts', 'index.ts');
  });
});

describe('close', () => {
  test('closes file', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.close(OTHER)).resolves.toBe(true);

    expect(dock.get(OTHER.id)).toBeNull();
    expect(deleted).not.toHaveBeenCalled();
  });

  test('closes terminal without deleting it', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.close(TERMINAL)).resolves.toBe(true);

    expect(dock.get(TERMINAL.id)).toBeNull();
    expect(deleted).not.toHaveBeenCalled();
  });

  test('returns true for panel that is not open', async () => {
    const { dock } = await mount();

    await expect(dock.close({ ...OTHER, id: 'closed' })).resolves.toBe(true);
  });

  // Adds a third file after the file and the other, and returns its panel.
  function addThird(dock: DockManager) {
    const third = dock.addFile('third.ts', { tab: 'last', with: FILE });
    if (third === null) {
      throw new Error('third not added');
    }
    return third;
  }

  test('shows and activates tab on left of closed tab', async () => {
    const { dock } = await mount();
    const third = addThird(dock);
    dock.activate(FILE);
    dock.activate(third);

    await dock.close(third);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('shows tab on right of closed first tab', async () => {
    const { dock } = await mount();
    const third = addThird(dock);
    dock.activate(third);
    dock.activate(FILE);

    await dock.close(FILE);

    expect(dock.groups[0]).toEqual({ panels: [OTHER, third], shown: OTHER });
  });

  test('shows tab on right of closed tab when set', async () => {
    const { dock } = await mount(undefined, 'right');
    const third = addThird(dock);
    dock.activate(third);
    dock.activate(FILE);

    await dock.close(FILE);

    expect(dock.groups[0]).toEqual({ panels: [OTHER, third], shown: OTHER });
  });

  test('shows tab on left of closed last tab when set to right', async () => {
    const { dock } = await mount(undefined, 'right');
    const third = addThird(dock);
    dock.activate(FILE);
    dock.activate(third);

    await dock.close(third);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: OTHER });
  });

  test('shows most recent tab when set', async () => {
    const { dock } = await mount(undefined, 'recent');
    const third = addThird(dock);
    dock.activate(FILE);
    dock.activate(third);

    await dock.close(third);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: FILE });
  });

  test('keeps shown tab when another closes', async () => {
    const { dock } = await mount();
    const third = addThird(dock);
    dock.activate(third);

    await dock.close(OTHER);

    expect(dock.groups[0]).toEqual({ panels: [FILE, third], shown: third });
  });

  test('keeps active panel when shown tab of other group closes', async () => {
    const { dock } = await mount();
    const third = addThird(dock);
    dock.activate(third);
    dock.activate(TERMINAL);

    await dock.close(third);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(TERMINAL);
  });

  test('closes panel that cannot be closed when forced', async () => {
    const { dock } = await mount();

    await expect(dock.close(FILE_TREE, true)).resolves.toBe(true);

    expect(dock.get(FILE_TREE.id)).toBeNull();
  });

  test('closes without asking when forced', async () => {
    const close = vi.fn(() => false);
    const { dock } = await mount(close);

    await expect(dock.close(OTHER, true)).resolves.toBe(true);

    expect(dock.get(OTHER.id)).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  test('closes at once when forced while panel is asked', async () => {
    const { dock } = await mount(() => new Promise<boolean>(() => {}));
    void dock.close(OTHER);

    await expect(dock.close(OTHER, true)).resolves.toBe(true);

    expect(dock.get(OTHER.id)).toBeNull();
  });

  test('closes panel that source allows', async () => {
    const close = vi.fn(() => true);
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, close }]);
    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await expect(dock.close(panel as Panel)).resolves.toBe(true);

    expect(close).toHaveBeenCalledExactlyOnceWith(application, dock, panel);
    expect(dock.panels).toHaveLength(4);
  });

  test('keeps panel that source refuses', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, close: async () => false }]);
    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await expect(dock.close(panel as Panel)).resolves.toBe(false);

    expect(dock.get(panel?.id ?? '')).toEqual(panel);
  });

  test('keeps panel that cannot be closed without asking its source', async () => {
    const close = vi.fn(() => true);
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...TOOL, close }]);
    const panel = dock.addPanel(TOOL.id, { edge: 'bottom' });

    await expect(dock.close(panel as Panel)).resolves.toBe(false);

    expect(close).not.toHaveBeenCalled();
    expect(dock.get(panel?.id ?? '')).toEqual(panel);
  });

  test('keeps panel that cannot be closed', async () => {
    const { dock } = await mount();

    await expect(dock.close(FILE_TREE)).resolves.toBe(false);

    expect(dock.get(FILE_TREE.id)).toEqual(FILE_TREE);
  });

  test('closes panel that component allows', async () => {
    const close = vi.fn(() => true);
    const { application, dock } = await mount(close);

    await expect(dock.close(OTHER)).resolves.toBe(true);

    expect(close).toHaveBeenCalledExactlyOnceWith(application, dock, OTHER);
    expect(dock.get(OTHER.id)).toBeNull();
  });

  test('keeps panel that component refuses', async () => {
    const { dock } = await mount(async () => false);

    await expect(dock.close(OTHER)).resolves.toBe(false);

    expect(dock.get(OTHER.id)).toEqual(OTHER);
  });

  test('rejects and keeps panel whose component rejects', async () => {
    const { dock } = await mount(() => Promise.reject(new Error('unreadable')));

    await expect(dock.close(OTHER)).rejects.toThrow('unreadable');

    expect(dock.get(OTHER.id)).toEqual(OTHER);
  });

  test('asks component once while panel is closing', async () => {
    let allow = (_: boolean) => {};
    const close = vi.fn(() => new Promise<boolean>((resolve) => (allow = resolve)));
    const { dock } = await mount(close);

    const closes = [dock.close(OTHER), dock.close(OTHER)];
    allow(true);

    await expect(Promise.all(closes)).resolves.toEqual([true, true]);
    expect(close).toHaveBeenCalledOnce();
  });

  test('asks component again after it refused', async () => {
    const close = vi.fn(() => false);
    const { dock } = await mount(close);

    await dock.close(OTHER);
    await dock.close(OTHER);

    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe('show', () => {
  test('shows panel without activating it', async () => {
    const { dock } = await mount();
    dock.activate(TERMINAL);

    dock.show(OTHER);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(TERMINAL);
  });

  test('shows hidden group of panel', async () => {
    const { dock } = await mount();
    dock.hide(FILE_TREE);

    dock.show(FILE_TREE);

    expect(dock.groups[2]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
    expect(dock.activePanel).toEqual(FILE);
  });
});

describe('hide', () => {
  test('hides group of panel', async () => {
    const { dock } = await mount();

    dock.hide(OTHER);

    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: null });
  });

  test('activates last active panel that is shown', async () => {
    const { dock } = await mount();
    dock.activate(TERMINAL);
    dock.activate(FILE);

    dock.hide(FILE);

    expect(dock.activePanel).toEqual(TERMINAL);
  });
});

describe('activate', () => {
  test('activates panel', async () => {
    const { dock } = await mount();

    dock.activate(OTHER);

    expect(dock.activePanel).toEqual(OTHER);
    expect(dock.groups[0]).toEqual({ panels: [FILE, OTHER], shown: OTHER });
  });

  test('shows hidden group of panel', async () => {
    const { dock } = await mount();
    dock.hide(FILE_TREE);

    dock.activate(FILE_TREE);

    expect(dock.activePanel).toEqual(FILE_TREE);
    expect(dock.groups[2]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
  });

  test('ignores panel that is not open', async () => {
    const { dock } = await mount();

    dock.activate({ ...OTHER, id: 'closed' });

    expect(dock.activePanel).toEqual(FILE);
  });
});

describe('sizes', () => {
  const A = { ...TERMINAL, id: 'terminal:a', session: { ...WORKSPACE, session: 'a' } };
  const B = { ...TERMINAL, id: 'terminal:b', session: { ...WORKSPACE, session: 'b' } };
  const C = { ...TERMINAL, id: 'terminal:c', session: { ...WORKSPACE, session: 'c' } };

  // A dock whose row has the files 500 wide, a 120 wide, b 150 wide and the file tree.
  async function mountRow() {
    const mounted = await mount();
    const { dockview } = mounted;
    dockview.getPanel(TERMINAL.id)?.api.close();

    const add = (panel: TerminalPanel, reference: Panel, direction: 'right' | 'below') =>
      dockview.addPanel({
        id: panel.id,
        component: 'terminal',
        params: { session: panel.session.session },
        position: { referencePanel: reference.id, direction },
      });
    const width = (panel: Panel) => dockview.getPanel(panel.id)?.group.api.width;
    const height = (panel: Panel) => dockview.getPanel(panel.id)?.group.api.height;
    const resize = async (panel: Panel, size: { width?: number; height?: number }) => {
      dockview.getPanel(panel.id)?.group.api.setSize(size);
      await new Promise((resolve) => setTimeout(resolve));
    };

    add(A, FILE, 'right');
    add(B, A, 'right');
    await resize(FILE, { width: 500 });
    await resize(A, { width: 120 });
    await resize(B, { width: 150 });
    return { ...mounted, add, width, height, resize, fileTree: width(FILE_TREE) };
  }

  test('gives width of closed group to previous group', async () => {
    const { dock, width, fileTree } = await mountRow();

    await dock.close(A);

    expect([width(FILE), width(B), width(FILE_TREE)]).toEqual([620, 150, fileTree]);
  });

  test('gives width of closed first group to next group', async () => {
    const { dock, width, fileTree } = await mountRow();
    await dock.close(OTHER);

    await dock.close(FILE);

    expect([width(A), width(B), width(FILE_TREE)]).toEqual([620, 150, fileTree]);
  });

  test('gives width of closed group to tab group over tabless panel', async () => {
    const { dock, width, resize } = await mountRow();
    dock.move(FILE_TREE, { edge: 'left' });
    await resize(FILE_TREE, { width: 300 });
    await resize(FILE, { width: 400 });
    await resize(A, { width: 120 });
    const b = width(B);
    await dock.close(OTHER);

    await dock.close(FILE);

    expect([width(FILE_TREE), width(A), width(B)]).toEqual([300, 520, b]);
  });

  test('keeps equal groups equal when group closes', async () => {
    const { dock, dockview, width, resize } = await mountRow();
    const quarter = dockview.width / 4;
    await resize(FILE, { width: quarter });
    await resize(A, { width: quarter });
    await resize(B, { width: quarter });

    await dock.close(A);

    const widths = [width(FILE) ?? 0, width(B) ?? 0, width(FILE_TREE) ?? 0];
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
  });

  test('gives height of closed group to previous group', async () => {
    const { dock, add, height, resize } = await mountRow();
    add(C, B, 'below');
    add(TERMINAL, C, 'below');
    await resize(B, { height: 400 });
    await resize(C, { height: 100 });

    await dock.close(C);

    expect([height(B), height(TERMINAL)]).toEqual([500, 200]);
  });

  test('keeps width of stack beside closed group', async () => {
    const { dock, add, width, fileTree } = await mountRow();
    add(C, B, 'below');

    await dock.close(A);

    expect([width(FILE), width(B), width(C), width(FILE_TREE)]).toEqual([620, 150, 150, fileTree]);
  });

  test('keeps widths of other groups when last tab moves to another group', async () => {
    const { dock, width, fileTree } = await mountRow();

    dock.move(A, { tab: 'last', with: B });

    expect([width(FILE), width(B), width(FILE_TREE)]).toEqual([620, 150, fileTree]);
  });

  test('keeps widths of other groups when last tab moves to group of its own', async () => {
    const { dock, width, fileTree } = await mountRow();

    dock.move(A, { group: 'below', of: B });

    expect([width(FILE), width(A), width(B), width(FILE_TREE)]).toEqual([620, 150, 150, fileTree]);
  });

  test('keeps widths of other groups when last tab moves along bottom edge', async () => {
    const { dock, width, fileTree } = await mountRow();

    dock.move(A, { edge: 'bottom' });

    expect([width(FILE), width(B), width(FILE_TREE)]).toEqual([620, 150, fileTree]);
  });

  test('shrinks other groups alike when last tab moves along left edge', async () => {
    const { dock, dockview, width, fileTree } = await mountRow();

    dock.move(A, { edge: 'left' });

    const scale = (dockview.width - (width(A) ?? 0)) / dockview.width;
    expect(width(FILE)).toBeCloseTo(620 * scale, -1);
    expect(width(B)).toBeCloseTo(150 * scale, -1);
    expect(width(FILE_TREE)).toBeCloseTo((fileTree ?? 0) * scale, -1);
  });

  test('restores widths before next frame', async () => {
    const { dock, width } = await mountRow();
    const frame = new Promise((resolve) => requestAnimationFrame(() => resolve([width(FILE), width(B)])));

    dock.move(A, { tab: 'last', with: B });

    await expect(frame).resolves.toEqual([620, 150]);
  });
});

describe('placeholder', () => {
  const PLACEHOLDER = { id: 'placeholder', type: 'placeholder', tab: true, closable: false } as const;
  const LAYOUTS = ['one tool', 'stacked tools', 'tools in grid', 'stacked tools on left'] as const;

  // A dock without a tab, whose tools are 266 wide beside the placeholder.
  async function mountEmpty(layout: (typeof LAYOUTS)[number]) {
    const mounted = await mount();
    const { dock, dockview } = mounted;
    const tool = (id: string, referencePanel: string, direction: 'below' | 'right') =>
      dockview.addPanel({
        id,
        component: 'fileTree',
        tabComponent: 'fileTree',
        position: { referencePanel, direction },
      });
    if (layout !== 'one tool') {
      tool('tool:c', FILE_TREE.id, 'below');
    }
    if (layout === 'tools in grid') {
      tool('tool:b', FILE_TREE.id, 'right');
      tool('tool:d', 'tool:c', 'right');
      dockview.getPanel(FILE_TREE.id)?.group.api.setSize({ width: 100 });
    }
    if (layout === 'stacked tools on left') {
      dock.move(FILE, { edge: 'right', width: 798 });
      dock.move(OTHER, { tab: 'last', with: FILE });
      dock.move(TERMINAL, { tab: 'last', with: FILE });
    }
    await new Promise((resolve) => setTimeout(resolve));

    const sizes = () =>
      Object.fromEntries(dockview.groups.map((group) => [group.panels[0]?.id, [group.api.width, group.api.height]]));
    const tools = Object.fromEntries(
      Object.entries(sizes()).filter(([id]) => id === FILE_TREE.id || id.startsWith('tool:')),
    );
    for (const panel of [FILE, OTHER, TERMINAL]) {
      await dock.close(panel);
    }
    return { ...mounted, sizes, tools };
  }

  test.each(LAYOUTS)('takes place of last tab panel beside %s', async (layout) => {
    const { dock, sizes, tools } = await mountEmpty(layout);

    expect(sizes()).toEqual({ ...tools, [PLACEHOLDER.id]: [798, 700] });
    expect(dock.activeTabPanel).toEqual(PLACEHOLDER);
  });

  test.each(LAYOUTS)('leaves its place to tab panel beside %s', async (layout) => {
    const { dock, sizes, tools } = await mountEmpty(layout);

    const panel = dock.addFile('src/new.ts', { tab: 'last', with: PLACEHOLDER });

    expect(sizes()).toEqual({ ...tools, [panel?.id ?? '']: [798, 700] });
    expect(dock.get(PLACEHOLDER.id)).toBeNull();
  });

  test('closes when tab panel opens in group of its own', async () => {
    const { dock } = await mountEmpty('one tool');

    const panel = dock.addFile('src/new.ts', { edge: 'bottom' });

    expect(dock.panels).toEqual([FILE_TREE, panel]);
  });

  test('stays while tab panel is open', async () => {
    const { dock } = await mount();

    await dock.close(OTHER);
    await dock.close(TERMINAL);

    expect(dock.get(PLACEHOLDER.id)).toBeNull();
  });
});
