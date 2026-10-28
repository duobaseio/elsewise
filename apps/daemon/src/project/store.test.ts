import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type Database, openDatabase } from '../database/database';
import { MIGRATIONS } from '../gen/migrations';
import { ProjectStore } from './store';

let db: Database;
let store: ProjectStore;

beforeEach(() => {
  db = openDatabase(':memory:', MIGRATIONS);
  store = new ProjectStore(db);
});

afterEach(async () => {
  await db.destroy();
});

test('getProjects returns projects oldest first', async () => {
  const a = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
  const b = await store.createProject({ name: 'B', folder: 'b', absolute_path: '/b' });
  expect((await store.getProjects()).map((project) => project.id)).toEqual([a.project.id, b.project.id]);
});

describe('getProject', () => {
  test('returns the project with the path of its main workspace', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    expect(await store.getProject(project.id)).toEqual(project);
  });

  test('returns undefined when the project does not exist', async () => {
    expect(await store.getProject('missing')).toBeUndefined();
  });
});

test('hasProjectFolder returns whether a project has the folder', async () => {
  await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
  expect(await store.hasProjectFolder('a')).toBe(true);
  expect(await store.hasProjectFolder('b')).toBe(false);
});

describe('createProject', () => {
  test('creates the project with its main workspace', async () => {
    const { project, workspace } = await store.createProject({
      name: 'Demo',
      folder: 'demo',
      absolute_path: '/repos/demo',
    });
    expect(project).toMatchObject({ name: 'Demo', folder: 'demo', absolute_path: '/repos/demo' });
    expect(workspace).toMatchObject({
      project_id: project.id,
      name: 'Demo',
      absolute_path: '/repos/demo',
      main: 1,
      created_at: project.created_at,
    });
    expect(await store.getProject(project.id)).toEqual(project);
    expect(await store.getWorkspaces(project.id)).toEqual([workspace]);
  });

  test('refuses a taken path or folder and leaves nothing behind', async () => {
    await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    await expect(store.createProject({ name: 'B', folder: 'b', absolute_path: '/a' })).rejects.toThrow(/UNIQUE/);
    await expect(store.createProject({ name: 'B', folder: 'a', absolute_path: '/b' })).rejects.toThrow(/UNIQUE/);
    expect(await store.getProjects()).toHaveLength(1);
    expect(await store.hasProjectFolder('b')).toBe(false);
    expect(await store.findWorkspaceByPath('/b')).toBeUndefined();
  });
});

describe('updateProject', () => {
  test('updates the project', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const updated = await store.updateProject(project.id, { name: 'B' });
    expect(updated).toEqual({ ...project, name: 'B' });
    expect(await store.getProject(project.id)).toEqual(updated);
  });

  test('returns undefined when the project does not exist', async () => {
    expect(await store.updateProject('missing', { name: 'B' })).toBeUndefined();
  });
});

describe('deleteProject', () => {
  test('deletes the project with its workspaces', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    await store.createWorkspace({ project_id: project.id, name: 'feature', absolute_path: '/a-feature' });
    expect(await store.deleteProject(project.id)).toBe(true);
    expect(await store.getProject(project.id)).toBeUndefined();
    expect(await store.getWorkspaces(project.id)).toEqual([]);
  });

  test('returns false when the project does not exist', async () => {
    expect(await store.deleteProject('missing')).toBe(false);
  });
});

test('getWorkspaces returns the main workspace followed by the oldest first', async () => {
  const { project, workspace: main } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
  const first = await store.createWorkspace({ project_id: project.id, name: 'first', absolute_path: '/a-first' });
  const second = await store.createWorkspace({ project_id: project.id, name: 'second', absolute_path: '/a-second' });
  expect((await store.getWorkspaces(project.id)).map((workspace) => workspace.id)).toEqual([
    main.id,
    first.id,
    second.id,
  ]);
});

describe('getWorkspace', () => {
  test('returns the workspace of the project', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const workspace = await store.createWorkspace({ project_id: project.id, name: 'feature', absolute_path: '/a-f' });
    expect(await store.getWorkspace(project.id, workspace.id)).toEqual(workspace);
  });

  test('returns undefined when the workspace belongs to another project', async () => {
    const a = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const b = await store.createProject({ name: 'B', folder: 'b', absolute_path: '/b' });
    expect(await store.getWorkspace(b.project.id, a.workspace.id)).toBeUndefined();
  });
});

describe('findWorkspaceByPath', () => {
  test('returns the workspace at the path', async () => {
    const { workspace } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    expect(await store.findWorkspaceByPath('/a')).toEqual(workspace);
  });

  test('returns undefined when no workspace is at the path', async () => {
    expect(await store.findWorkspaceByPath('/missing')).toBeUndefined();
  });
});

describe('createWorkspace', () => {
  test('creates a workspace', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const workspace = await store.createWorkspace({ project_id: project.id, name: 'feature', absolute_path: '/a-f' });
    expect(workspace).toMatchObject({ project_id: project.id, name: 'feature', absolute_path: '/a-f', main: 0 });
    expect(await store.getWorkspace(project.id, workspace.id)).toEqual(workspace);
  });

  test('refuses a taken path', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    await expect(store.createWorkspace({ project_id: project.id, name: 'again', absolute_path: '/a' })).rejects.toThrow(
      /UNIQUE/,
    );
  });

  test('refuses a project that does not exist', async () => {
    await expect(
      store.createWorkspace({ project_id: 'missing', name: 'feature', absolute_path: '/feature' }),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe('updateWorkspace', () => {
  test('updates the workspace', async () => {
    const { project } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const workspace = await store.createWorkspace({ project_id: project.id, name: 'feature', absolute_path: '/a-f' });
    const updated = await store.updateWorkspace(project.id, workspace.id, { name: 'other' });
    expect(updated).toEqual({ ...workspace, name: 'other' });
    expect(await store.getWorkspace(project.id, workspace.id)).toEqual(updated);
  });

  test('returns undefined when the workspace belongs to another project', async () => {
    const a = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const b = await store.createProject({ name: 'B', folder: 'b', absolute_path: '/b' });
    expect(await store.updateWorkspace(b.project.id, a.workspace.id, { name: 'other' })).toBeUndefined();
    expect(await store.getWorkspace(a.project.id, a.workspace.id)).toEqual(a.workspace);
  });
});

describe('deleteWorkspace', () => {
  test('deletes the workspace', async () => {
    const { project, workspace: main } = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const workspace = await store.createWorkspace({ project_id: project.id, name: 'feature', absolute_path: '/a-f' });
    expect(await store.deleteWorkspace(project.id, workspace.id)).toBe(true);
    expect(await store.getWorkspaces(project.id)).toEqual([main]);
  });

  test('returns false when the workspace belongs to another project', async () => {
    const a = await store.createProject({ name: 'A', folder: 'a', absolute_path: '/a' });
    const b = await store.createProject({ name: 'B', folder: 'b', absolute_path: '/b' });
    expect(await store.deleteWorkspace(b.project.id, a.workspace.id)).toBe(false);
    expect(await store.getWorkspaces(a.project.id)).toEqual([a.workspace]);
  });
});
