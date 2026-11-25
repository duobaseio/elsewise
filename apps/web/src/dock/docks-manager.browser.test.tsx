import { describe, expect, test, vi } from 'vitest';
import { WorkspaceManager } from '@/projects/workspace-manager';
import { TerminalManager } from '@/terminals/terminal-manager';
import {
  addTerminal,
  FILE,
  FILE_TREE,
  mount as mountDock,
  showWorkspace,
  TERMINAL,
  WORKSPACE,
  workspaceRouter,
} from '../../test/dock';
import type { DockManager } from './dock-manager';
import { DocksManager } from './docks-manager';

// Dockview reports some changes late, so listeners are given time to be called.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// The docks of a workspace manager that shows the workspace if `shown`.
async function docksOf(shown: boolean) {
  const { client, router } = workspaceRouter();
  const workspaces = new WorkspaceManager(client, router);
  if (shown) {
    await showWorkspace(router);
    await vi.waitFor(() => expect(workspaces.active).not.toBeNull());
  }
  return new DocksManager(workspaces, new TerminalManager(client));
}

async function mount(shown = true) {
  const docks = await docksOf(shown);
  let attached: DockManager | undefined;
  const api = await mountDock((ready) => {
    attached = docks.attach(WORKSPACE, ready);
  });
  await settle();

  const opened = vi.fn();
  const closed = vi.fn();
  const changed = vi.fn();
  docks.onPanelOpen(opened);
  docks.onPanelClose(closed);
  docks.onChange(changed);
  return { docks, api, attached: attached as DockManager, opened, closed, changed };
}

describe('addPanelComponents', () => {
  const FILE_COMPONENT = { type: 'file', tab: () => null, panel: () => null } as const;
  const TERMINAL_COMPONENT = { type: 'terminal', tab: () => null, panel: () => null } as const;

  test('lists components in order of addition', async () => {
    const docks = await docksOf(false);

    docks.addPanelComponents([FILE_COMPONENT]);
    docks.addPanelComponents([TERMINAL_COMPONENT]);

    expect(docks.panelComponents).toEqual([FILE_COMPONENT, TERMINAL_COMPONENT]);
  });

  test('removes components when disposed', async () => {
    const docks = await docksOf(false);
    docks.addPanelComponents([FILE_COMPONENT]);

    const dispose = docks.addPanelComponents([TERMINAL_COMPONENT]);
    void dispose();

    expect(docks.panelComponents).toEqual([FILE_COMPONENT]);
  });
});

describe('active', () => {
  test('returns dock of shown workspace', async () => {
    const { docks } = await mount();

    expect(docks.active?.workspace.id).toEqual(WORKSPACE);
  });

  test('returns null until workspace is shown', async () => {
    const { docks } = await mount(false);

    expect(docks.active).toBeNull();
  });
});

describe('attach', () => {
  test('returns dock before workspace is shown', async () => {
    const { docks, attached } = await mount(false);

    expect(docks.active).toBeNull();
    expect(attached.panels).toEqual([FILE, FILE_TREE]);
  });

  test('reports change without opened panels', async () => {
    const docks = await docksOf(true);
    const opened = vi.fn();
    const changed = vi.fn();
    docks.onPanelOpen(opened);
    docks.onChange(changed);

    await mountDock((ready) => docks.attach(WORKSPACE, ready));
    await settle();

    expect(changed).toHaveBeenCalledExactlyOnceWith(docks.active);
    expect(opened).not.toHaveBeenCalled();
  });

  test('reports change without closed panels after detach', async () => {
    const { docks, attached, closed, changed } = await mount();

    docks.detach(attached);
    await settle();

    expect(docks.active).toBeNull();
    expect(changed).toHaveBeenCalledExactlyOnceWith(null);
    expect(closed).not.toHaveBeenCalled();
  });
});

describe('onPanelOpen', () => {
  test('reports panel that dock already has', async () => {
    const { docks, api } = await mount();
    const panels = vi.fn();
    docks.onPanelOpen((dock) => panels(dock.panels));

    addTerminal(api);

    expect(panels).toHaveBeenCalledExactlyOnceWith([FILE, TERMINAL, FILE_TREE]);
  });

  test('reports added panel before change', async () => {
    const { docks, api, opened, closed, changed } = await mount();

    addTerminal(api);
    await settle();

    expect(opened).toHaveBeenCalledExactlyOnceWith(docks.active, TERMINAL);
    expect(closed).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledExactlyOnceWith(docks.active);
    expect(opened.mock.invocationCallOrder[0]).toBeLessThan(changed.mock.invocationCallOrder[0] as number);
  });

  test('ignores panel moved to other group', async () => {
    const { api, opened, closed, changed } = await mount();
    addTerminal(api);
    await settle();
    opened.mockClear();
    changed.mockClear();

    const file = api.getPanel(FILE.id);
    api.getPanel('terminal:1')?.api.moveTo({ group: file?.group });
    await settle();

    expect(opened).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
  });
});

describe('onPanelClose', () => {
  test('reports removed panel', async () => {
    const { docks, api, opened, closed } = await mount();
    addTerminal(api);
    await settle();
    opened.mockClear();

    api.getPanel('terminal:1')?.api.close();
    await settle();

    expect(closed).toHaveBeenCalledExactlyOnceWith(docks.active, TERMINAL);
    expect(opened).not.toHaveBeenCalled();
  });
});

describe('onChange', () => {
  test('reports changes made together once', async () => {
    const { api, changed } = await mount();

    addTerminal(api);
    api.getPanel('fileTree')?.api.setActive();
    api.getPanel('fileTree')?.group.api.setVisible(false);
    await settle();

    expect(changed).toHaveBeenCalledOnce();
  });

  test('reports hidden group', async () => {
    const { docks, api, changed } = await mount();

    api.getPanel('fileTree')?.group.api.setVisible(false);
    await settle();

    expect(changed).toHaveBeenCalledExactlyOnceWith(docks.active);
  });

  test('ignores resized group', async () => {
    const { api, changed } = await mount();

    api.getPanel('fileTree')?.group.api.setSize({ width: 200 });
    await settle();

    expect(changed).not.toHaveBeenCalled();
  });
});
