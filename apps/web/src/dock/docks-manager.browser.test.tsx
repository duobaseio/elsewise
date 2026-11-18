import { create } from '@bufbuild/protobuf';
import type { Disposable } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, test, vi } from 'vitest';
import { WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { WorkspaceManager, workspacesQuery } from '@/projects/workspace-manager';
import { TerminalManager } from '@/terminals/terminal-manager';
import { addTerminal, EDITOR, FILE_TREE, mount as mountDock, TERMINAL, WORKSPACE } from '../../test/dock';
import { DocksManager } from './docks-manager';

// Dockview reports some changes late, so listeners are given time to be called.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// The docks of a workspace manager that shows the workspace if `shown`.
async function docksOf(shown: boolean) {
  const client = new QueryClient();
  client.setQueryData(workspacesQuery(WORKSPACE.daemon, WORKSPACE.project).queryKey, [
    create(WorkspaceSchema, { projectId: WORKSPACE.project, id: WORKSPACE.workspace, name: 'w' }),
  ]);
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/$daemon/$project/$workspace' })]),
    history: createMemoryHistory(),
  });
  const workspaces = new WorkspaceManager(client, router);
  if (shown) {
    await router.navigate({ to: `/${WORKSPACE.daemon}/${WORKSPACE.project}/${WORKSPACE.workspace}` });
    await router.load();
    await vi.waitFor(() => expect(workspaces.active).not.toBeNull());
  }
  return new DocksManager(workspaces, new TerminalManager(client));
}

async function mount(shown = true) {
  const docks = await docksOf(shown);
  let detach: Disposable | undefined;
  const api = await mountDock((ready) => {
    detach = docks.attach(WORKSPACE, ready);
  });
  await settle();

  const opened = vi.fn();
  const closed = vi.fn();
  const changed = vi.fn();
  docks.onPanelOpen(opened);
  docks.onPanelClose(closed);
  docks.onChange(changed);
  return { docks, api, detach: detach as Disposable, opened, closed, changed };
}

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
    const { docks, detach, closed, changed } = await mount();

    void detach();
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

    expect(panels).toHaveBeenCalledExactlyOnceWith([EDITOR, TERMINAL, FILE_TREE]);
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

    const editor = api.getPanel(EDITOR.id);
    api.getPanel('terminal:1')?.api.moveTo({ group: editor?.group });
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
