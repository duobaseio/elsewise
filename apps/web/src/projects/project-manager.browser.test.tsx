import { create } from '@bufbuild/protobuf';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, test, vi } from 'vitest';
import { type Daemon, daemonQuery } from '@/daemon';
import { Progress_Phase } from '@/gen/elsewise/daemon/git/v1/git_pb';
import {
  CloneProjectResponseSchema,
  CreateProjectResponseSchema,
  ProjectSchema,
  UpdateProjectResponseSchema,
  WorkspaceSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { ProjectManager, projectsQuery } from '@/projects/project-manager';
import { workspacesQuery } from '@/projects/workspace-manager';

const ELSEWISE = { daemon: 'local', project: 'elsewise' };
const DHAKA: WorkspaceId = { ...ELSEWISE, workspace: 'dhaka' };
const TOKYO: WorkspaceId = { daemon: 'local', project: 'dotfiles', workspace: 'tokyo' };

function setup() {
  const elsewise = create(ProjectSchema, { id: 'elsewise', name: 'elsewise', state: { case: 'ok', value: {} } });
  const daemon = {
    getProjects: vi.fn(async () => ({
      projects: [
        elsewise,
        create(ProjectSchema, { id: 'notes', name: 'notes', state: { case: 'missing', value: {} } }),
        create(ProjectSchema, { id: 'old', name: 'old' }),
      ],
    })),
    createProject: vi.fn(async () => create(CreateProjectResponseSchema, { project: elsewise })),
    cloneProject: vi.fn(async function* () {
      yield create(CloneProjectResponseSchema, {
        event: { case: 'progress', value: { phase: Progress_Phase.RECEIVING, percent: 40 } },
      });
      yield create(CloneProjectResponseSchema, { event: { case: 'project', value: elsewise } });
    }),
    updateProject: vi.fn(async () =>
      create(UpdateProjectResponseSchema, { project: { ...elsewise, name: 'Elsewise' } }),
    ),
    deleteProject: vi.fn(async () => ({})),
    getWorkspaces: vi.fn(() => new Promise<never>(() => {})),
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery('local').queryKey, { projects: daemon } as unknown as Daemon);
  client.setQueryData(workspacesQuery('local', 'elsewise').queryKey, [
    create(WorkspaceSchema, { projectId: 'elsewise', id: 'singapore', name: 'Singapore', main: true }),
    create(WorkspaceSchema, { projectId: 'elsewise', id: 'dhaka', name: 'Dhaka' }),
  ]);
  client.setQueryData(workspacesQuery('local', 'dotfiles').queryKey, [
    create(WorkspaceSchema, { projectId: 'dotfiles', id: 'tokyo', name: 'Tokyo', main: true }),
  ]);
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/$daemon/$project/$workspace' })]),
    history: createMemoryHistory(),
  });
  const projects = new ProjectManager(client, router);
  const show = async (workspace: WorkspaceId) => {
    await router.navigate({ to: `/${workspace.daemon}/${workspace.project}/${workspace.workspace}` });
    await router.load();
    await vi.waitFor(() => expect(projects.workspaces.active?.id).toEqual(workspace));
  };
  return { projects, client, router, daemon, show };
}

describe('list', () => {
  test('converts states, unset as broken', async () => {
    const { projects } = setup();

    expect(await projects.list('local')).toEqual([
      { id: ELSEWISE, name: 'elsewise', state: 'ok', absolutePath: '' },
      { id: { daemon: 'local', project: 'notes' }, name: 'notes', state: 'missing', absolutePath: '' },
      { id: { daemon: 'local', project: 'old' }, name: 'old', state: 'broken', absolutePath: '' },
    ]);
  });
});

describe('add', () => {
  test('sends new source', async () => {
    const { projects, daemon } = setup();

    const project = await projects.add('local', { type: 'new', name: 'elsewise', absolutePath: '/code/elsewise' });

    expect(project.id).toEqual(ELSEWISE);
    expect(daemon.createProject).toHaveBeenCalledExactlyOnceWith({
      source: { case: 'new', value: { name: 'elsewise', absolutePath: '/code/elsewise' } },
    });
  });

  test('sends existing source', async () => {
    const { projects, daemon } = setup();

    await projects.add('local', { type: 'existing', absolutePath: '/code/elsewise' });

    expect(daemon.createProject).toHaveBeenCalledExactlyOnceWith({
      source: { case: 'existing', value: { name: undefined, absolutePath: '/code/elsewise' } },
    });
  });

  test('refreshes projects', async () => {
    const { projects, client } = setup();
    client.setQueryData(projectsQuery('local').queryKey, []);

    await projects.add('local', { type: 'new', name: 'elsewise' });

    expect(client.getQueryState(projectsQuery('local').queryKey)?.isInvalidated).toBe(true);
  });
});

describe('clone', () => {
  test('reports progress and returns project', async () => {
    const { projects, daemon } = setup();
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    const project = await projects.clone('local', { url: 'https://example.com/elsewise.git' }, { onProgress, signal });

    expect(project.id).toEqual(ELSEWISE);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith({ phase: 'receiving', percent: 40 });
    expect(daemon.cloneProject).toHaveBeenCalledExactlyOnceWith(
      { url: 'https://example.com/elsewise.git', name: undefined, absolutePath: undefined },
      { signal },
    );
  });

  test('rejects stream without project', async () => {
    const { projects, daemon } = setup();
    daemon.cloneProject.mockImplementation(async function* () {});

    await expect(projects.clone('local', { url: 'https://example.com/elsewise.git' })).rejects.toThrow(
      'The clone ended without a project.',
    );
  });
});

describe('rename', () => {
  test('returns renamed project', async () => {
    const { projects, daemon } = setup();

    const project = await projects.rename(ELSEWISE, 'Elsewise');

    expect(project.name).toBe('Elsewise');
    expect(daemon.updateProject).toHaveBeenCalledExactlyOnceWith({ projectId: 'elsewise', name: 'Elsewise' });
  });

  test('shows name before daemon responds', async () => {
    const { projects, client, daemon } = setup();
    await projects.list('local');
    daemon.updateProject.mockReturnValue(new Promise(() => {}));

    void projects.rename(ELSEWISE, 'Elsewise');

    expect(client.getQueryData(projectsQuery('local').queryKey)?.[0]?.name).toBe('Elsewise');
  });

  test('restores name after failure', async () => {
    const { projects, client, daemon } = setup();
    await projects.list('local');
    daemon.updateProject.mockRejectedValue(new Error('Gone'));

    await expect(projects.rename(ELSEWISE, 'Elsewise')).rejects.toThrow('Gone');

    expect(client.getQueryData(projectsQuery('local').queryKey)?.[0]?.name).toBe('elsewise');
  });
});

describe('delete', () => {
  test('navigates away from shown project and removes its statuses', async () => {
    const { projects, router, daemon, show } = setup();
    await show(DHAKA);
    projects.workspaces.addStatus(DHAKA, 'running');

    await projects.delete(ELSEWISE, { deleteFiles: true });

    expect(router.state.location.pathname).toBe('/');
    expect(projects.workspaces.status(DHAKA)).toBe('idle');
    expect(daemon.deleteProject).toHaveBeenCalledExactlyOnceWith({ projectId: 'elsewise', deleteFiles: true });
  });

  test('navigates away from loading project', async () => {
    const { projects, router } = setup();
    await router.navigate({
      to: '/$daemon/$project/$workspace',
      params: { daemon: 'local', project: 'notes', workspace: 'lisbon' },
    });
    await router.load();

    await projects.delete({ daemon: 'local', project: 'notes' });

    expect(router.state.location.pathname).toBe('/');
  });

  test('keeps other project shown', async () => {
    const { projects, router, show } = setup();
    await show(TOKYO);
    projects.workspaces.addStatus(TOKYO, 'running');

    await projects.delete(ELSEWISE);

    expect(router.state.location.pathname).toBe('/local/dotfiles/tokyo');
    expect(projects.workspaces.status(TOKYO)).toBe('running');
  });

  test('drops workspaces', async () => {
    const { projects, client } = setup();

    await projects.delete(ELSEWISE);

    expect(client.getQueryData(workspacesQuery('local', 'elsewise').queryKey)).toBeUndefined();
  });

  test('keeps project shown when daemon rejects', async () => {
    const { projects, router, daemon, show } = setup();
    daemon.deleteProject.mockRejectedValue(new Error('Busy'));
    await show(DHAKA);
    projects.workspaces.addStatus(DHAKA, 'running');

    await expect(projects.delete(ELSEWISE)).rejects.toThrow('Busy');

    expect(router.state.location.pathname).toBe('/local/elsewise/dhaka');
    expect(projects.workspaces.status(DHAKA)).toBe('running');
  });
});

describe('searchRepositories', () => {
  const SIGNAL = { signal: new AbortController().signal };
  const DOTFILES = { name: 'matthias/dotfiles', url: 'https://github.com/matthias/dotfiles.git' };
  const NOTES = { name: 'matthias/notes', url: 'https://github.com/matthias/notes.git' };
  const TOOLS = { name: 'elsewise/tools', url: 'https://github.com/elsewise/tools.git' };

  test('merges groups by id with first defined values', async () => {
    const { projects } = setup();
    projects.addRepositorySources([
      async () => [{ id: 'github.matthias', label: 'GitHub · matthias', items: [DOTFILES] }],
      async () => [{ id: 'github.matthias', order: 10, label: 'GitHub', items: [NOTES] }],
    ]);

    expect(await projects.searchRepositories('', SIGNAL)).toEqual([
      { id: 'github.matthias', order: 10, label: 'GitHub · matthias', items: [DOTFILES, NOTES] },
    ]);
  });

  test('keeps first defined icon', async () => {
    const { projects } = setup();
    const First = () => null;
    const Second = () => null;
    projects.addRepositorySources([
      async () => [{ id: 'github.matthias', items: [DOTFILES] }],
      async () => [{ id: 'github.matthias', icon: First, items: [NOTES] }],
      async () => [{ id: 'github.matthias', icon: Second, items: [] }],
    ]);

    expect((await projects.searchRepositories('', SIGNAL))[0]?.icon).toBe(First);
  });

  test('orders by order then id, unordered last', async () => {
    const { projects } = setup();
    projects.addRepositorySources([
      async () => [
        { id: 'c', items: [DOTFILES] },
        { id: 'b', order: 20, items: [DOTFILES] },
        { id: 'a', order: 20, items: [DOTFILES] },
        { id: 'd', order: 10, items: [DOTFILES] },
      ],
    ]);

    expect((await projects.searchRepositories('', SIGNAL)).map((group) => group.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  test('hides empty groups', async () => {
    const { projects } = setup();
    projects.addRepositorySources([
      async () => [
        { id: 'github.matthias', items: [] },
        { id: 'github.elsewise', items: [TOOLS] },
      ],
    ]);

    expect((await projects.searchRepositories('', SIGNAL)).map((group) => group.id)).toEqual(['github.elsewise']);
  });

  test('skips rejecting source', async () => {
    const { projects } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    projects.addRepositorySources([
      async () => {
        throw new Error('Signed out');
      },
      async () => [{ id: 'github.elsewise', items: [TOOLS] }],
    ]);

    expect(await projects.searchRepositories('', SIGNAL)).toEqual([
      { id: 'github.elsewise', order: undefined, icon: undefined, label: undefined, items: [TOOLS] },
    ]);
  });

  test('passes query and signal', async () => {
    const { projects } = setup();
    const source = vi.fn(async () => []);
    projects.addRepositorySources([source]);

    await projects.searchRepositories('dot', SIGNAL);

    expect(source).toHaveBeenCalledExactlyOnceWith('dot', SIGNAL);
  });

  test('removes sources on dispose', async () => {
    const { projects } = setup();
    const dispose = projects.addRepositorySources([async () => [{ id: 'github.elsewise', items: [TOOLS] }]]);

    dispose();

    expect(await projects.searchRepositories('', SIGNAL)).toEqual([]);
  });
});
