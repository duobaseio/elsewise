import fs from 'node:fs/promises';
import path from 'node:path';
import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toProtocolPath } from '../../src/fs/path';
import type { Project, Workspace } from '../../src/gen/elsewise/daemon/project/v1/project_service_pb';
import { ANIMALS } from '../../src/project/name';
import { collect } from '../harness';
import { ProjectHarness } from './harness';

let harness: ProjectHarness;

beforeEach(async () => {
  harness = await ProjectHarness.start();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await harness.close();
});

/** Makes a repository under the root and adds it as a project. */
async function addRepo(name = 'repo'): Promise<{ project: Project; root: string }> {
  const repo = await harness.repo(name);
  const response = await harness.client.createProject({
    source: { case: 'existing', value: { name: '', absolutePath: repo.protocolRoot } },
  });
  return { project: response.project as Project, root: repo.nativeRoot };
}

async function getWorkspaces(projectId: string): Promise<Workspace[]> {
  return (await harness.client.getWorkspaces({ projectId })).workspaces;
}

/** Gives the daemon an identity and a commit for the repository so a worktree can be added to it. */
async function commitInto(native: string): Promise<void> {
  const repo = harness.open(native);
  await repo.run('config', 'user.name', 'Test');
  await repo.run('config', 'user.email', 'test@example.com');
  await repo.commit('README.md', '');
}

async function exists(native: string): Promise<boolean> {
  return fs.stat(native).then(
    () => true,
    () => false,
  );
}

describe('CreateProject', () => {
  test("creates a repository at main under the project's folder", async () => {
    const { project } = await harness.client.createProject({
      source: { case: 'new', value: { name: 'My Project', absolutePath: '' } },
    });
    const native = path.join(harness.code.workspaces, 'my-project', 'main');
    expect(project).toMatchObject({
      name: 'My Project',
      absolutePath: toProtocolPath(native),
      state: { case: 'ok' },
    });
    expect(await harness.open(native).run('rev-parse', '--is-inside-work-tree')).toBe('true');
    expect(await getWorkspaces(project?.id ?? '')).toMatchObject([
      { name: 'My Project', absolutePath: toProtocolPath(native), main: true, state: { case: 'ok' } },
    ]);
  });

  test('suffixes the folder of a project whose name is taken', async () => {
    const create = (name: string) =>
      harness.client.createProject({ source: { case: 'new', value: { name, absolutePath: '' } } });
    await create('API');
    const { project } = await create('api');
    const native = path.join(harness.code.workspaces, 'api-2', 'main');
    expect(project?.absolutePath).toBe(toProtocolPath(native));
    await commitInto(native);
    const { workspace } = await harness.client.createWorkspace({
      projectId: project?.id ?? '',
      source: { case: 'new', value: { name: 'Feature' } },
    });
    expect(workspace?.absolutePath).toBe(toProtocolPath(path.join(harness.code.workspaces, 'api-2', 'feature')));
  });

  test('creates a repository at the path given as an empty folder', async () => {
    await fs.mkdir(harness.nativeAt('empty'));
    const { project } = await harness.client.createProject({
      source: { case: 'new', value: { name: 'Empty', absolutePath: `${harness.protocolRoot}/empty` } },
    });
    expect(project).toMatchObject({ absolutePath: `${harness.protocolRoot}/empty`, state: { case: 'ok' } });
    expect(await exists(harness.nativeAt('empty', '.git'))).toBe(true);
  });

  test('refuses a new project without a name, usable folder name, or with an occupied folder', async () => {
    const create = (name: string, absolutePath = '') =>
      harness.client.createProject({ source: { case: 'new', value: { name, absolutePath } } });
    await expect(create('')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await expect(create('???')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await expect(create('x', 'relative')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await fs.mkdir(harness.nativeAt('taken'));
    await fs.writeFile(harness.nativeAt('taken', 'a.txt'), '');
    await expect(create('Taken', `${harness.protocolRoot}/taken`)).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
  });

  test('adds an existing repository', async () => {
    const repo = await harness.repo('existing');
    const { project } = await harness.client.createProject({
      source: { case: 'existing', value: { name: '', absolutePath: repo.protocolRoot } },
    });
    expect(project).toMatchObject({ name: 'existing', absolutePath: repo.protocolRoot, state: { case: 'ok' } });

    const named = await harness.repo('other');
    const response = await harness.client.createProject({
      source: { case: 'existing', value: { name: 'Other', absolutePath: named.protocolRoot } },
    });
    expect(response.project?.name).toBe('Other');
  });

  test('refuses an existing path that is missing, not a repository, a linked worktree or already added', async () => {
    const existing = (absolutePath: string) =>
      harness.client.createProject({ source: { case: 'existing', value: { name: '', absolutePath } } });
    await expect(existing(`${harness.protocolRoot}/missing`)).rejects.toMatchObject({ code: Code.NOT_FOUND });
    await fs.mkdir(harness.nativeAt('plain'));
    await expect(existing(`${harness.protocolRoot}/plain`)).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });

    const repo = await harness.repo('repo');
    await repo.run('worktree', 'add', '--quiet', harness.nativeAt('linked'), '-b', 'feature');
    await expect(existing(`${harness.protocolRoot}/linked`)).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });

    await existing(repo.protocolRoot);
    await expect(existing(repo.protocolRoot)).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await fs.symlink(repo.nativeRoot, harness.nativeAt('alias'));
    await expect(existing(`${harness.protocolRoot}/alias`)).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
  });

  test('stores a path given through a symlink', async () => {
    const repo = await harness.repo('real');
    await fs.symlink(repo.nativeRoot, harness.nativeAt('link'));
    const { project } = await harness.client.createProject({
      source: { case: 'existing', value: { name: '', absolutePath: `${harness.protocolRoot}/link` } },
    });
    expect(project).toMatchObject({ name: 'real', absolutePath: repo.protocolRoot });
  });

  test('refuses a request without a source', async () => {
    await expect(harness.client.createProject({})).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });
});

describe('CloneProject', () => {
  test("clones to main under the project's folder", async () => {
    const origin = await harness.repo('origin');
    const { seen, ended } = collect(
      harness.client.cloneProject({ url: origin.nativeRoot, absolutePath: '', name: '' }),
    );
    await ended;

    const native = path.join(harness.code.workspaces, 'origin', 'main');
    expect(seen.slice(0, -1).every((response) => response.event.case === 'progress')).toBe(true);
    expect(seen.at(-1)?.event).toMatchObject({
      case: 'project',
      value: { name: 'origin', absolutePath: toProtocolPath(native), state: { case: 'ok' } },
    });
    expect(await harness.client.getProjects({})).toMatchObject({ projects: [{ name: 'origin' }] });
  });

  test('clones to the path and name given', async () => {
    const origin = await harness.repo('origin');
    const { seen, ended } = collect(
      harness.client.cloneProject({ url: origin.nativeRoot, absolutePath: `${harness.protocolRoot}/clone`, name: 'C' }),
    );
    await ended;
    expect(seen.at(-1)?.event).toMatchObject({
      case: 'project',
      value: { name: 'C', absolutePath: `${harness.protocolRoot}/clone` },
    });
  });

  test('fails for a repository that cannot be reached', async () => {
    const url = harness.nativeAt('nowhere');
    const { ended } = collect(harness.client.cloneProject({ url, absolutePath: '', name: '' }));
    await expect(ended).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    expect(await exists(path.join(harness.code.workspaces, 'nowhere'))).toBe(false);
    expect(await harness.client.getProjects({})).toMatchObject({ projects: [] });
  });

  test('refuses an option as the url and a folder that is occupied or stored', async () => {
    const origin = await harness.repo('origin');
    const clone = (url: string, absolutePath = '') =>
      collect(harness.client.cloneProject({ url, absolutePath, name: '' })).ended;
    await expect(clone('--upload-pack=x')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await expect(clone(origin.nativeRoot, origin.protocolRoot)).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await harness.client.createProject({
      source: { case: 'existing', value: { name: '', absolutePath: origin.protocolRoot } },
    });
    await expect(clone(origin.nativeRoot, origin.protocolRoot)).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
  });
});

describe('GetProjects', () => {
  test('lists projects with its respective states', async () => {
    const ok = await addRepo('ok');
    const missing = await addRepo('missing');
    const broken = await addRepo('broken');
    const linked = await addRepo('linked');
    await fs.rm(missing.root, { recursive: true });
    await fs.rm(path.join(broken.root, '.git'), { recursive: true });
    // Swap the linked project's folder for a linked worktree of another repository.
    await fs.rm(linked.root, { recursive: true });
    await harness.open(ok.root).run('worktree', 'add', '--quiet', linked.root, '-b', 'feature');

    const { projects } = await harness.client.getProjects({});
    expect(projects.map((project) => [project.name, project.state.case])).toEqual([
      ['ok', 'ok'],
      ['missing', 'missing'],
      ['broken', 'broken'],
      ['linked', 'broken'],
    ]);
  });
});

describe('UpdateProject', () => {
  test('renames the project', async () => {
    const { project } = await addRepo();
    const { project: renamed } = await harness.client.updateProject({ projectId: project.id, name: 'Renamed' });
    expect(renamed).toMatchObject({ id: project.id, name: 'Renamed', state: { case: 'ok' } });
    expect(await harness.client.getProjects({})).toMatchObject({ projects: [{ name: 'Renamed' }] });
  });

  test('refuses an empty name and an unknown project', async () => {
    const { project } = await addRepo();
    await expect(harness.client.updateProject({ projectId: project.id, name: '' })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
    await expect(harness.client.updateProject({ projectId: 'unknown', name: 'x' })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
  });
});

describe('DeleteProject', () => {
  test('deletes the stored project and its workspaces', async () => {
    const { project, root } = await addRepo();
    await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Feature', branch: '', base: '' } },
    });
    await harness.client.deleteProject({ projectId: project.id, deleteFiles: false });
    expect(await harness.client.getProjects({})).toMatchObject({ projects: [] });
    await expect(getWorkspaces(project.id)).rejects.toMatchObject({ code: Code.NOT_FOUND });
    expect(await exists(root)).toBe(true);
    expect(await exists(path.join(harness.code.workspaces, 'repo', 'feature'))).toBe(true);
  });

  test('deletes the main worktree and every linked one from disk when deleteFiles is true', async () => {
    const { project, root } = await addRepo();
    await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Feature', branch: '', base: '' } },
    });
    await harness.open(root).run('worktree', 'add', '--quiet', harness.nativeAt('unstored'), '-b', 'unstored');
    await harness.client.deleteProject({ projectId: project.id, deleteFiles: true });
    expect(await exists(root)).toBe(false);
    expect(await exists(path.join(harness.code.workspaces, 'repo'))).toBe(false);
    expect(await exists(harness.nativeAt('unstored'))).toBe(false);
  });

  test('refuses an unknown project', async () => {
    await expect(harness.client.deleteProject({ projectId: 'unknown', deleteFiles: false })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
  });
});

describe('CreateWorkspace', () => {
  test('creates a linked worktree on a new branch', async () => {
    const { project, root } = await addRepo();
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Login Page', branch: '', base: '' } },
    });
    const native = path.join(harness.code.workspaces, 'repo', 'login-page');
    expect(workspace).toMatchObject({
      projectId: project.id,
      name: 'Login Page',
      absolutePath: toProtocolPath(native),
      main: false,
      state: { case: 'ok', value: { branch: 'login-page' } },
    });
    expect(await harness.open(native).run('branch', '--show-current')).toBe('login-page');
    expect(await harness.open(root).run('rev-parse', 'login-page')).toBe(
      await harness.open(root).run('rev-parse', 'HEAD'),
    );
  });

  test('generates an name when none is given and is suffixed once the draws keep colliding', async () => {
    const { project } = await addRepo();
    const source = { case: 'new', value: { name: '', branch: '', base: '' } } as const;
    const first = await harness.client.createWorkspace({ projectId: project.id, source });
    const name = first.workspace?.name ?? '';
    expect(ANIMALS).toContain(name);
    expect(first.workspace).toMatchObject({ state: { value: { branch: name } } });

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fixed = ANIMALS[0] ?? '';
    const second = await harness.client.createWorkspace({ projectId: project.id, source });
    const third = await harness.client.createWorkspace({ projectId: project.id, source });
    const expected = name === fixed ? [`${fixed}-2`, `${fixed}-3`] : [fixed, `${fixed}-2`];
    expect(second.workspace).toMatchObject({ name: expected[0], state: { value: { branch: expected[0] } } });
    expect(third.workspace).toMatchObject({ name: expected[1], state: { value: { branch: expected[1] } } });
  });

  test('checks out a branch that exists or creates one from the base', async () => {
    const { project, root } = await addRepo();
    const repo = harness.open(root);
    const first = await repo.run('rev-parse', 'HEAD');
    await repo.run('branch', 'existing');
    await repo.commit('b.txt', 'b\n');

    const existing = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Existing', branch: 'existing', base: '' } },
    });
    expect(existing.workspace?.state).toMatchObject({ case: 'ok', value: { branch: 'existing' } });
    expect(await harness.open(path.resolve(existing.workspace?.absolutePath ?? '')).run('rev-parse', 'HEAD')).toBe(
      first,
    );

    const based = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Based', branch: 'based', base: first } },
    });
    expect(await harness.open(path.resolve(based.workspace?.absolutePath ?? '')).run('rev-parse', 'HEAD')).toBe(first);
  });

  test('refuses a base with an existing branch, a taken name, or an unhealthy project', async () => {
    const { project, root } = await addRepo();
    const create = (name: string, branch = '', base = '') =>
      harness.client.createWorkspace({ projectId: project.id, source: { case: 'new', value: { name, branch, base } } });
    await harness.open(root).run('branch', 'existing');
    await expect(create('x', 'existing', 'HEAD')).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    await expect(create('x', '--all')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await expect(create('???')).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await create('Taken');
    await expect(create('taken')).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await expect(
      harness.client.createWorkspace({ projectId: 'unknown', source: { case: 'new', value: { name: 'x' } } }),
    ).rejects.toMatchObject({ code: Code.NOT_FOUND });
    await fs.rm(root, { recursive: true });
    await expect(create('Later')).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });

  test('adds a linked worktree that exists and named after its folder by default', async () => {
    const { project, root } = await addRepo();
    await harness.open(root).run('worktree', 'add', '--quiet', harness.nativeAt('linked'), '-b', 'feature');
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'existing', value: { name: '', absolutePath: `${harness.protocolRoot}/linked` } },
    });
    expect(workspace).toMatchObject({
      name: 'linked',
      absolutePath: `${harness.protocolRoot}/linked`,
      main: false,
      state: { case: 'ok', value: { branch: 'feature' } },
    });
  });

  test('refuses an existing path that is missing, not a worktree of the project or already added', async () => {
    const { project, root } = await addRepo();
    const other = await harness.repo('other');
    const existing = (absolutePath: string) =>
      harness.client.createWorkspace({
        projectId: project.id,
        source: { case: 'existing', value: { name: '', absolutePath } },
      });
    await expect(existing(`${harness.protocolRoot}/missing`)).rejects.toMatchObject({ code: Code.NOT_FOUND });
    await fs.mkdir(harness.nativeAt('plain'));
    await expect(existing(`${harness.protocolRoot}/plain`)).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    await expect(existing(other.protocolRoot)).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    await expect(existing(toProtocolPath(root))).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await harness.open(root).run('worktree', 'add', '--quiet', harness.nativeAt('linked'), '-b', 'feature');
    await existing(`${harness.protocolRoot}/linked`);
    await expect(existing(`${harness.protocolRoot}/linked`)).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
  });
});

describe('GetWorkspaces', () => {
  test('lists the workspace sorted by the main workspace and then the oldest first', async () => {
    const { project, root } = await addRepo();
    const create = (name: string) =>
      harness.client.createWorkspace({ projectId: project.id, source: { case: 'new', value: { name } } });
    const ok = await create('ok');
    const detached = await create('detached');
    const missing = await create('missing');
    const broken = await create('broken');
    await harness.open(path.resolve(detached.workspace?.absolutePath ?? '')).run('switch', '--quiet', '--detach');
    await fs.rm(path.resolve(missing.workspace?.absolutePath ?? ''), { recursive: true });
    const brokenNative = path.resolve(broken.workspace?.absolutePath ?? '');
    await harness.open(root).run('worktree', 'remove', '--force', brokenNative);
    await fs.mkdir(brokenNative);

    const workspaces = await getWorkspaces(project.id);
    expect(workspaces.map((workspace) => [workspace.name, workspace.main, workspace.state.case])).toEqual([
      ['repo', true, 'ok'],
      ['ok', false, 'ok'],
      ['detached', false, 'detached'],
      ['missing', false, 'missing'],
      ['broken', false, 'broken'],
    ]);
    expect(ok.workspace?.state).toMatchObject({ value: { branch: 'ok' } });
  });

  test('reports the main workspace as missing and the linked ones as broken when the repository is deleted', async () => {
    const { project, root } = await addRepo();
    const linked = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'linked' } },
    });
    await fs.rm(root, { recursive: true });
    expect((await getWorkspaces(project.id)).map((workspace) => workspace.state.case)).toEqual(['missing', 'broken']);
    expect(await exists(path.resolve(linked.workspace?.absolutePath ?? ''))).toBe(true);
  });
});

describe('UpdateWorkspace', () => {
  test('renames the workspace and leaves its branch alone', async () => {
    const { project } = await addRepo();
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Feature' } },
    });
    const id = workspace?.id ?? '';
    const renamed = await harness.client.updateWorkspace({ projectId: project.id, workspaceId: id, name: 'Renamed' });
    expect(renamed.workspace).toMatchObject({ name: 'Renamed', state: { value: { branch: 'feature' } } });
  });

  test('refuses an unknown workspace', async () => {
    const { project } = await addRepo();
    await expect(
      harness.client.updateWorkspace({ projectId: project.id, workspaceId: 'unknown', name: 'x' }),
    ).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});

describe('DeleteWorkspace', () => {
  test('deletes the stored workspace and leaves the worktree alone', async () => {
    const { project, root } = await addRepo();
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Feature' } },
    });
    await harness.client.deleteWorkspace({ projectId: project.id, workspaceId: workspace?.id ?? '' });
    expect(await getWorkspaces(project.id)).toHaveLength(1);
    expect(await exists(path.resolve(workspace?.absolutePath ?? ''))).toBe(true);
    expect(await harness.open(root).run('worktree', 'list')).toContain('feature');
  });

  test('removes the worktree and the branch when the respective flags are set', async () => {
    const { project, root } = await addRepo();
    const create = (name: string) =>
      harness.client.createWorkspace({ projectId: project.id, source: { case: 'new', value: { name } } });
    const kept = await create('Kept');
    const dropped = await create('Dropped');
    await fs.writeFile(path.join(path.resolve(dropped.workspace?.absolutePath ?? ''), 'dirty.txt'), '');

    await harness.client.deleteWorkspace({
      projectId: project.id,
      workspaceId: kept.workspace?.id ?? '',
      deleteFiles: true,
    });
    await harness.client.deleteWorkspace({
      projectId: project.id,
      workspaceId: dropped.workspace?.id ?? '',
      deleteFiles: true,
      deleteBranch: true,
    });
    expect(await exists(path.resolve(kept.workspace?.absolutePath ?? ''))).toBe(false);
    expect(await exists(path.resolve(dropped.workspace?.absolutePath ?? ''))).toBe(false);
    expect(await exists(path.join(harness.code.workspaces, 'repo'))).toBe(false);
    const repo = harness.open(root);
    expect(await repo.run('worktree', 'list', '--porcelain')).not.toContain('kept');
    expect(await repo.run('branch', '--list', 'kept', 'dropped')).toBe('kept');
  });

  test('removes a workspace whose folder is deleted', async () => {
    const { project, root } = await addRepo();
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Gone' } },
    });
    await fs.rm(path.resolve(workspace?.absolutePath ?? ''), { recursive: true });
    await harness.client.deleteWorkspace({
      projectId: project.id,
      workspaceId: workspace?.id ?? '',
      deleteFiles: true,
      deleteBranch: true,
    });
    expect(await getWorkspaces(project.id)).toHaveLength(1);
    expect(await harness.open(root).run('worktree', 'list', '--porcelain')).not.toContain('gone');
    expect(await harness.open(root).run('branch', '--list', 'gone')).toBe('');
  });

  test('refuses the main workspace, a branch deletion without the files and an unknown workspace', async () => {
    const { project } = await addRepo();
    const [main] = await getWorkspaces(project.id);
    await expect(
      harness.client.deleteWorkspace({ projectId: project.id, workspaceId: main?.id ?? '' }),
    ).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    const { workspace } = await harness.client.createWorkspace({
      projectId: project.id,
      source: { case: 'new', value: { name: 'Feature' } },
    });
    await expect(
      harness.client.deleteWorkspace({ projectId: project.id, workspaceId: workspace?.id ?? '', deleteBranch: true }),
    ).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    await expect(
      harness.client.deleteWorkspace({ projectId: project.id, workspaceId: 'unknown' }),
    ).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});
