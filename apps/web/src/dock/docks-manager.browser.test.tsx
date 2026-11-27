import { describe, expect, test, vi } from 'vitest';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../test/commands';
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
import type { PanelComponent } from './panel-component';

// Dockview reports some changes late, so listeners are given time to be called.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// An application that shows the workspace if `shown`, whose docks have `panelComponents`.
async function applicationOf(shown: boolean, panelComponents: readonly PanelComponent[] = []) {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router), panelComponents });
  if (shown) {
    await showWorkspace(router);
    await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());
  }
  return application;
}

async function mount(shown = true, panelComponents: readonly PanelComponent[] = []) {
  const application = await applicationOf(shown, panelComponents);
  const { docks } = application;
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
  return { application, docks, api, attached: attached as DockManager, opened, closed, changed };
}

describe('addPanelComponents', () => {
  const FILE_COMPONENT = { type: 'file', header: () => null, panel: () => null } as const;
  const TERMINAL_COMPONENT = { type: 'terminal', header: () => null, panel: () => null } as const;

  test('lists components in order of addition', async () => {
    const { docks } = await applicationOf(false);

    docks.addPanelComponents([FILE_COMPONENT]);
    docks.addPanelComponents([TERMINAL_COMPONENT]);

    expect(docks.panelComponents).toEqual([FILE_COMPONENT, TERMINAL_COMPONENT]);
  });

  test('removes components when disposed', async () => {
    const { docks } = await applicationOf(false);
    docks.addPanelComponents([FILE_COMPONENT]);

    const dispose = docks.addPanelComponents([TERMINAL_COMPONENT]);
    void dispose();

    expect(docks.panelComponents).toEqual([FILE_COMPONENT]);
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

describe('addPanelSources', () => {
  test('lists sources in order of addition', async () => {
    const { docks } = await applicationOf(false);

    docks.addPanelSources([REPORT]);
    docks.addPanelSources([TOOL]);

    expect(docks.panelSources).toEqual([REPORT, TOOL]);
  });

  test('omits source whose id already exists', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { docks } = await applicationOf(false);
    docks.addPanelSources([REPORT]);

    docks.addPanelSources([{ ...REPORT, tab: false }, TOOL]);

    expect(docks.panelSources).toEqual([REPORT, TOOL]);
    expect(warned).toHaveBeenCalledExactlyOnceWith('Panel source example/report already exists');
  });

  test('omits source whose id is not namespaced', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { docks } = await applicationOf(false);

    docks.addPanelSources([{ ...REPORT, id: 'file' as never }]);

    expect(docks.panelSources).toEqual([]);
    expect(warned).toHaveBeenCalledExactlyOnceWith('Panel source file is not namespaced');
  });

  test('removes sources when disposed', async () => {
    const { docks } = await applicationOf(false);
    docks.addPanelSources([REPORT]);

    const dispose = docks.addPanelSources([TOOL]);
    void dispose();

    expect(docks.panelSources).toEqual([REPORT]);
  });

  test('keeps source of same id that was added after omitted one is disposed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { docks } = await applicationOf(false);
    docks.addPanelSources([REPORT]);

    const dispose = docks.addPanelSources([{ ...REPORT, tab: false }]);
    void dispose();

    expect(docks.panelSources).toEqual([REPORT]);
  });

  test('closes panels of disposed sources without asking', async () => {
    const close = vi.fn(() => false);
    const { docks, attached } = await mount();
    const dispose = docks.addPanelSources([{ ...REPORT, close }]);
    docks.addPanelSources([TOOL]);
    const report = attached.addPanel(REPORT.id, { tab: 'after', of: FILE });
    const tool = attached.addPanel(TOOL.id, { edge: 'bottom' });

    void dispose();

    expect(attached.panels).toEqual([FILE, FILE_TREE, tool]);
    expect(report).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('onPanelSourcesChange', () => {
  test('reports added and removed sources', async () => {
    const { docks } = await applicationOf(false);
    const changed = vi.fn();
    docks.onPanelSourcesChange(changed);

    const dispose = docks.addPanelSources([REPORT]);
    void dispose();

    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('addPanelMenu', () => {
  const TERMINAL_ITEM = { order: 10, source: '@elsewise/terminal' };

  test('lists built-in group', async () => {
    const { docks } = await applicationOf(false);

    expect(docks.panelMenu).toEqual([
      { id: 'io.duobase.elsewise.dock.panelMenu.terminals', order: 10, items: [TERMINAL_ITEM] },
    ]);
  });

  test('merges items into group of same id', async () => {
    const { docks } = await applicationOf(false);

    docks.addPanelMenu([{ id: 'io.duobase.elsewise.dock.panelMenu.terminals', items: [{ source: REPORT.id }] }]);

    expect(docks.panelMenu).toEqual([
      { id: 'io.duobase.elsewise.dock.panelMenu.terminals', order: 10, items: [TERMINAL_ITEM, { source: REPORT.id }] },
    ]);
  });

  test('removes groups when disposed', async () => {
    const { docks } = await applicationOf(false);

    const dispose = docks.addPanelMenu([{ id: 'example.panels', items: [{ source: REPORT.id }] }]);
    void dispose();

    expect(docks.panelMenu).toHaveLength(1);
  });

  test('warns of differing order as panel menu group', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { docks } = await applicationOf(false);

    docks.addPanelMenu([{ id: 'io.duobase.elsewise.dock.panelMenu.terminals', order: 20, items: [] }]);

    expect(warned).toHaveBeenCalledExactlyOnceWith(
      'Panel menu group io.duobase.elsewise.dock.panelMenu.terminals already has order 10, ignoring 20',
    );
  });
});

describe('onPanelMenuChange', () => {
  test('reports added and removed groups', async () => {
    const { docks } = await applicationOf(false);
    const changed = vi.fn();
    docks.onPanelMenuChange(changed);

    const dispose = docks.addPanelMenu([{ id: 'example.panels', items: [{ source: REPORT.id }] }]);
    void dispose();

    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe('closeSourcelessPanels', () => {
  test('closes panels whose source was not added', async () => {
    const { docks, attached, api } = await mount();
    docks.addPanelSources([REPORT]);
    const report = attached.addPanel(REPORT.id, { tab: 'after', of: FILE });
    api.addPanel({
      id: 'custom:gone',
      tabComponent: 'custom',
      component: 'custom',
      params: { type: 'example/gone' },
    });

    docks.closeSourcelessPanels();

    expect(attached.panels).toEqual([FILE, report, FILE_TREE]);
  });

  test('closes panels whose source was not added in dock attached afterwards', async () => {
    const { docks } = await applicationOf(true);
    docks.closeSourcelessPanels();

    let attached: DockManager | undefined;
    await mountDock((ready) => {
      ready.addPanel({
        id: 'custom:gone',
        tabComponent: 'custom',
        component: 'custom',
        params: { type: 'example/gone' },
      });
      attached = docks.attach(WORKSPACE, ready);
    });

    expect(attached?.panels).toEqual([FILE, FILE_TREE]);
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
  test('asks component of panel type before panel closes', async () => {
    const close = vi.fn(() => false);
    const { application, attached } = await mount(true, [
      { type: 'file', header: () => null, panel: () => null, close },
    ]);

    await expect(attached.close(FILE)).resolves.toBe(false);

    expect(close).toHaveBeenCalledExactlyOnceWith(application, attached, FILE);
    expect(attached.get(FILE.id)).toEqual(FILE);
  });

  test('returns dock before workspace is shown', async () => {
    const { docks, attached } = await mount(false);

    expect(docks.active).toBeNull();
    expect(attached.panels).toEqual([FILE, FILE_TREE]);
  });

  test('reports change without opened panels', async () => {
    const { docks } = await applicationOf(true);
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
