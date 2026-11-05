import { create } from '@bufbuild/protobuf';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, test, vi } from 'vitest';
import { type Daemon, daemonQuery } from '@/daemon';
import { WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { WorkspaceManager, workspacesQuery } from '@/projects/workspace-manager';

const MAIN: WorkspaceId = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };
const DHAKA: WorkspaceId = { daemon: 'local', project: 'elsewise', workspace: 'dhaka' };

function setup() {
  const deleteWorkspace = vi.fn(async () => ({}));
  const client = new QueryClient();
  client.setQueryData(daemonQuery('local').queryKey, { projects: { deleteWorkspace } } as unknown as Daemon);
  client.setQueryData(workspacesQuery('local', 'elsewise').queryKey, [
    create(WorkspaceSchema, { projectId: 'elsewise', id: 'singapore', name: 'Singapore', main: true }),
    create(WorkspaceSchema, { projectId: 'elsewise', id: 'dhaka', name: 'Dhaka' }),
  ]);
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/$daemon/$project/$workspace' })]),
    history: createMemoryHistory(),
  });
  const workspaces = new WorkspaceManager(client, router);
  const show = async (workspace: WorkspaceId) => {
    await router.navigate({ to: `/${workspace.daemon}/${workspace.project}/${workspace.workspace}` });
    await router.load();
    await vi.waitFor(() => expect(workspaces.active?.id).toEqual(workspace));
  };
  return { workspaces, client, router, show, deleteWorkspace };
}

describe('status', () => {
  test('prefers waiting over running', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'running');
    workspaces.addStatus(DHAKA, 'waiting');

    expect(workspaces.status(DHAKA)).toBe('waiting');
  });

  test('stays running until every status finishes', () => {
    const { workspaces } = setup();
    const a = workspaces.addStatus(DHAKA, 'running');
    const b = workspaces.addStatus(DHAKA, 'running');

    a.set('finished');
    expect(workspaces.status(DHAKA)).toBe('running');

    b.set('finished');
    expect(workspaces.status(DHAKA)).toBe('finished');
  });

  test('finishes when rest dispose', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'finished');
    workspaces.addStatus(DHAKA, 'running').dispose();

    expect(workspaces.status(DHAKA)).toBe('finished');
  });

  test('idles when only status disposes', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'running').dispose();

    expect(workspaces.status(DHAKA)).toBe('idle');
  });

  test('ignores idle statuses', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'finished');
    workspaces.addStatus(DHAKA, 'idle');

    expect(workspaces.status(DHAKA)).toBe('finished');
  });

  test('ignores other workspaces', () => {
    const { workspaces } = setup();
    workspaces.addStatus(MAIN, 'waiting');

    expect(workspaces.status(DHAKA)).toBe('idle');
  });

  test('clears finished once shown', async () => {
    const { workspaces, show } = setup();
    workspaces.addStatus(DHAKA, 'finished');

    await show(DHAKA);

    expect(workspaces.status(DHAKA)).toBe('idle');
  });

  test('skips finished while shown', async () => {
    const { workspaces, show } = setup();
    await show(DHAKA);
    const status = workspaces.addStatus(DHAKA, 'running');

    status.set('finished');

    expect(workspaces.status(DHAKA)).toBe('idle');
  });

  test('ignores set after dispose', () => {
    const { workspaces } = setup();
    const status = workspaces.addStatus(DHAKA, 'running');
    status.dispose();

    status.set('waiting');

    expect(workspaces.status(DHAKA)).toBe('idle');
  });
});

describe('resetStatus', () => {
  test('idles finished statuses', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'finished');

    workspaces.resetStatus(DHAKA);

    expect(workspaces.status(DHAKA)).toBe('idle');
  });

  test('keeps running and waiting statuses', () => {
    const { workspaces } = setup();
    workspaces.addStatus(DHAKA, 'finished');
    workspaces.addStatus(DHAKA, 'running');

    workspaces.resetStatus(DHAKA);

    expect(workspaces.status(DHAKA)).toBe('running');
  });

  test('ignores other workspaces', () => {
    const { workspaces } = setup();
    workspaces.addStatus(MAIN, 'finished');

    workspaces.resetStatus(DHAKA);

    expect(workspaces.status(MAIN)).toBe('finished');
  });
});

describe('active', () => {
  test('ignores stale navigation', async () => {
    const { workspaces, client, router, show } = setup();
    const { promise, resolve } = Promise.withResolvers<{ workspaces: unknown[] }>();
    client.setQueryData(daemonQuery('remote').queryKey, {
      projects: { getWorkspaces: () => promise },
    } as unknown as Daemon);
    await show(DHAKA);

    await router.navigate({
      to: '/$daemon/$project/$workspace',
      params: { daemon: 'remote', project: 'notes', workspace: 'lisbon' },
    });
    await router.load();
    await show(DHAKA);
    resolve({ workspaces: [create(WorkspaceSchema, { projectId: 'notes', id: 'lisbon', name: 'Lisbon' })] });
    await new Promise((resolve) => setTimeout(resolve));

    expect(workspaces.active?.id).toEqual(DHAKA);
  });
});

describe('subscribe', () => {
  test('notifies on status change', () => {
    const { workspaces } = setup();
    const listener = vi.fn();
    workspaces.subscribe(listener);

    workspaces.addStatus(DHAKA, 'running').set('waiting');

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('onActiveChange', () => {
  test('calls listener with shown workspace', async () => {
    const { workspaces, show } = setup();
    const listener = vi.fn();
    workspaces.onActiveChange(listener);

    await show(DHAKA);

    expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: DHAKA, name: 'Dhaka' }));
  });

  test('calls listener on rename', async () => {
    const { workspaces, client, show } = setup();
    await show(DHAKA);
    const listener = vi.fn();
    workspaces.onActiveChange(listener);

    client.setQueryData(workspacesQuery('local', 'elsewise').queryKey, [
      create(WorkspaceSchema, { projectId: 'elsewise', id: 'singapore', name: 'Singapore', main: true }),
      create(WorkspaceSchema, { projectId: 'elsewise', id: 'dhaka', name: 'Dacca' }),
    ]);

    expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: DHAKA, name: 'Dacca' }));
  });

  test('calls listener once loaded', async () => {
    const { workspaces, client, router } = setup();
    client.setQueryData(daemonQuery('remote').queryKey, {
      projects: { getWorkspaces: () => Promise.reject(new Error('Offline')) },
    } as unknown as Daemon);
    const listener = vi.fn();
    workspaces.onActiveChange(listener);
    await router.navigate({
      to: '/$daemon/$project/$workspace',
      params: { daemon: 'remote', project: 'notes', workspace: 'lisbon' },
    });
    await router.load();
    await vi.waitFor(() =>
      expect(client.getQueryState(workspacesQuery('remote', 'notes').queryKey)?.status).toBe('error'),
    );
    await new Promise((resolve) => setTimeout(resolve));

    client.setQueryData(workspacesQuery('remote', 'notes').queryKey, [
      create(WorkspaceSchema, { projectId: 'notes', id: 'lisbon', name: 'Lisbon', main: true }),
    ]);

    expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'Lisbon' }));
  });
});

describe('delete', () => {
  test('navigates to main workspace and removes statuses', async () => {
    const { workspaces, router, show, deleteWorkspace } = setup();
    await show(DHAKA);
    workspaces.addStatus(DHAKA, 'waiting');

    await workspaces.delete(DHAKA, { deleteFiles: true });

    expect(router.state.location.pathname).toBe('/local/elsewise/singapore');
    expect(workspaces.status(DHAKA)).toBe('idle');
    expect(deleteWorkspace).toHaveBeenCalledExactlyOnceWith({
      projectId: 'elsewise',
      workspaceId: 'dhaka',
      deleteFiles: true,
      deleteBranch: false,
    });
  });

  test('refuses main workspace before closing it', async () => {
    const { workspaces, router, show, deleteWorkspace } = setup();
    await show(MAIN);

    await expect(workspaces.delete(MAIN)).rejects.toThrow('The main workspace cannot be deleted.');
    expect(router.state.location.pathname).toBe('/local/elsewise/singapore');
    expect(deleteWorkspace).not.toHaveBeenCalled();
  });

  test('keeps workspace shown when daemon rejects', async () => {
    const { workspaces, router, show, deleteWorkspace } = setup();
    deleteWorkspace.mockRejectedValue(new Error('Busy'));
    await show(DHAKA);
    workspaces.addStatus(DHAKA, 'waiting');

    await expect(workspaces.delete(DHAKA)).rejects.toThrow('Busy');

    expect(router.state.location.pathname).toBe('/local/elsewise/dhaka');
    expect(workspaces.status(DHAKA)).toBe('waiting');
  });
});
