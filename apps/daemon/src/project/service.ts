import fs from 'node:fs/promises';
import path from 'node:path';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, type HandlerContext, type ServiceImpl, TransportError } from '@elsewise/transport';
import type { CodeDirectory } from '../directories';
import { refuseOccupiedPath } from '../fs/directory';
import { errnoOf } from '../fs/error';
import { toNativeRoot, toProtocolPath } from '../fs/path';
import type {
  CloneProjectRequest,
  CloneProjectResponseSchema,
  CreateProjectRequest,
  CreateProjectRequest_Existing,
  CreateProjectRequest_New,
  CreateWorkspaceRequest,
  CreateWorkspaceRequest_Existing,
  CreateWorkspaceRequest_New,
  DeleteProjectRequest,
  DeleteWorkspaceRequest,
  GetWorkspacesRequest,
  ProjectSchema,
  ProjectService,
  UpdateProjectRequest,
  UpdateWorkspaceRequest,
  WorkspaceSchema,
} from '../gen/elsewise/daemon/project/v1/project_service_pb';
import { guardOperand, revisionOrHead } from '../git/args';
import { hasBranch } from '../git/commands/refs';
import { findWorktree, readWorktree, readWorktrees, type WorktreeInit } from '../git/commands/worktree';
import { attempt, GitError } from '../git/error';
import { Git } from '../git/git';
import { transfer } from '../git/transfer';
import { kebabCase, randomAnimal, repositoryName } from './name';
import type { ProjectRow, ProjectStore, WorkspaceRow } from './store';

type ProjectInit = MessageInitShape<typeof ProjectSchema>;
type ProjectState = NonNullable<ProjectInit['state']>;
type WorkspaceInit = MessageInitShape<typeof WorkspaceSchema>;
type WorkspaceState = NonNullable<WorkspaceInit['state']>;
type CloneEvent = MessageInitShape<typeof CloneProjectResponseSchema>;

// How many random names a workspace is attempted when a conflict occurs.
const WORKSPACE_NAME_ATTEMPTS = 5;

export interface ProjectOptions {
  /** The size in bytes past which the output of a git command fails the call. */
  readLimitBytes: number;
}

/** Represents a repository along with its corresponding git instance. */
interface Repository {
  git: Git;
  worktrees: WorktreeInit[];
}

/** The `ProjectService`. */
export class ProjectServiceImpl implements ServiceImpl<typeof ProjectService> {
  readonly #store: ProjectStore;
  readonly #code: CodeDirectory;
  readonly #options: ProjectOptions;

  constructor(store: ProjectStore, code: CodeDirectory, options: ProjectOptions) {
    this.#store = store;
    this.#code = code;
    this.#options = options;
  }

  createProject(request: CreateProjectRequest) {
    return attempt(async () => {
      switch (request.source.case) {
        case 'new':
          return { project: await this.#createNewProject(request.source.value) };
        case 'existing':
          return { project: await this.#addExistingProject(request.source.value) };
        default:
          throw new TransportError(Code.INVALID_ARGUMENT, 'the project needs a source');
      }
    });
  }

  async *cloneProject(request: CloneProjectRequest, { signal }: HandlerContext): AsyncGenerator<CloneEvent> {
    const url = guardOperand(request.url, 'url');
    const { name, folder, mainWorkspaceNativePath } = await attempt(async () => {
      let name = request.name;
      if (name === '') {
        name = request.absolutePath === '' ? repositoryName(url) : path.basename(toNativeRoot(request.absolutePath));
        if (name === '') {
          throw new TransportError(Code.INVALID_ARGUMENT, 'the url names no repository');
        }
      }
      const paths = await this.#allocateProjectPaths(name, request.absolutePath);
      await fs.mkdir(path.dirname(paths.mainWorkspaceNativePath), { recursive: true });
      return { name, ...paths };
    });

    let cloned = false;
    try {
      const git = new Git(path.dirname(mainWorkspaceNativePath), this.#options.readLimitBytes);
      for await (const progress of transfer(git, ['clone', '--progress', '--', url, mainWorkspaceNativePath], signal)) {
        yield { event: { case: 'progress', value: progress } };
      }
      cloned = true;
    } finally {
      if (!cloned) {
        await deleteProjectFolder(path.join(this.#code.workspaces, folder));
      }
    }
    const project = await attempt(() => this.#storeProject(name, folder, mainWorkspaceNativePath));
    yield { event: { case: 'project', value: project } };
  }

  getProjects() {
    return attempt(async () => {
      const rows = await this.#store.getProjects();
      return { projects: await Promise.all(rows.map((row) => this.#projectOf(row))) };
    });
  }

  updateProject(request: UpdateProjectRequest) {
    return attempt(async () => {
      if (request.name === '') {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the name must not be empty');
      }
      const project = await this.#store.updateProject(request.projectId, { name: request.name });
      if (!project) {
        throw new TransportError(Code.NOT_FOUND, 'the project does not exist');
      }
      return { project: await this.#projectOf(project) };
    });
  }

  deleteProject(request: DeleteProjectRequest) {
    return attempt(async () => {
      const project = await this.#refuseMissingProject(request.projectId);
      if (request.deleteFiles) {
        await this.#deleteProjectFiles(project);
      }
      await this.#store.deleteProject(project.id);
      return {};
    });
  }

  createWorkspace(request: CreateWorkspaceRequest) {
    return attempt(async () => {
      const project = await this.#refuseMissingProject(request.projectId);
      switch (request.source.case) {
        case 'new':
          return { workspace: await this.#createNewWorkspace(project, request.source.value) };
        case 'existing':
          return { workspace: await this.#addExistingWorkspace(project, request.source.value) };
        default:
          throw new TransportError(Code.INVALID_ARGUMENT, 'the workspace needs a source');
      }
    });
  }

  getWorkspaces(request: GetWorkspacesRequest) {
    return attempt(async () => {
      const project = await this.#refuseMissingProject(request.projectId);
      const { repository } = await this.#inspectProject(project);
      const rows = await this.#store.getWorkspaces(project.id);
      return { workspaces: await Promise.all(rows.map((row) => this.#workspaceOf(row, repository))) };
    });
  }

  updateWorkspace(request: UpdateWorkspaceRequest) {
    return attempt(async () => {
      const project = await this.#refuseMissingProject(request.projectId);
      let workspace = await this.#refuseMissingWorkspace(project.id, request.workspaceId);
      const { repository } = await this.#inspectProject(project);
      if (request.name !== '') {
        workspace = (await this.#store.updateWorkspace(project.id, workspace.id, { name: request.name })) ?? workspace;
      }
      return { workspace: await this.#workspaceOf(workspace, repository) };
    });
  }

  deleteWorkspace(request: DeleteWorkspaceRequest) {
    return attempt(async () => {
      const project = await this.#refuseMissingProject(request.projectId);
      const workspace = await this.#refuseMissingWorkspace(project.id, request.workspaceId);
      if (workspace.main === 1) {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the main workspace cannot be deleted');
      }
      if (request.deleteBranch && !request.deleteFiles) {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the branch can only be deleted with the files');
      }
      if (request.deleteFiles) {
        await this.#deleteWorkspaceFiles(project, workspace, request.deleteBranch);
      }
      await this.#store.deleteWorkspace(project.id, workspace.id);
      return {};
    });
  }

  async #createNewProject(source: CreateProjectRequest_New): Promise<ProjectInit> {
    if (source.name === '') {
      throw new TransportError(Code.INVALID_ARGUMENT, 'the name must not be empty');
    }
    const { folder, mainWorkspaceNativePath } = await this.#allocateProjectPaths(source.name, source.absolutePath);

    const created = !(await exists(mainWorkspaceNativePath));
    await fs.mkdir(mainWorkspaceNativePath, { recursive: true });
    try {
      await new Git(mainWorkspaceNativePath, this.#options.readLimitBytes).run(['init', '--quiet']);
    } catch (error) {
      if (created) {
        await fs.rm(mainWorkspaceNativePath, { recursive: true, force: true });
        await deleteProjectFolder(path.join(this.#code.workspaces, folder));
      }
      throw error;
    }
    return this.#storeProject(source.name, folder, mainWorkspaceNativePath);
  }

  async #addExistingProject(source: CreateProjectRequest_Existing): Promise<ProjectInit> {
    const mainWorkspaceNativePath = await canonicalPath(toNativeRoot(source.absolutePath));
    await this.#refuseStoredWorkspace(mainWorkspaceNativePath);
    await refuseNonDirectory(mainWorkspaceNativePath);
    const git = new Git(mainWorkspaceNativePath, this.#options.readLimitBytes);
    const worktree = await readWorktree(git, mainWorkspaceNativePath); // Fails for a folder that is not a repository.
    if (!worktree.main) {
      throw new TransportError(Code.FAILED_PRECONDITION, "the folder is not a repository's main working tree");
    }
    const name = source.name === '' ? path.basename(mainWorkspaceNativePath) : source.name;
    return this.#storeProject(name, await this.#allocateProjectFolder(name), mainWorkspaceNativePath);
  }

  async #createNewWorkspace(project: ProjectRow, source: CreateWorkspaceRequest_New): Promise<WorkspaceInit> {
    const repository = await this.#refuseUnhealthyProject(project);
    const name = source.name === '' ? await this.#generateWorkspaceName(project, repository) : source.name;
    const workspaceFolder = kebabCase(name);
    if (workspaceFolder === '') {
      throw new TransportError(
        Code.INVALID_ARGUMENT,
        'the name needs a letter or a digit to make a workspaceFolder name of',
      );
    }
    const branch = source.branch === '' ? workspaceFolder : guardOperand(source.branch, 'branch name');
    const workspaceNativePath = await canonicalPath(path.join(this.#code.workspaces, project.folder, workspaceFolder));
    await this.#refuseStoredWorkspace(workspaceNativePath);
    await refuseOccupiedPath(workspaceNativePath, 'empty');

    const args = ['worktree', 'add'];
    if (await hasBranch(repository.git, branch)) {
      if (source.base !== '') {
        throw new TransportError(Code.FAILED_PRECONDITION, `branch ${branch} already exists`);
      }
      args.push(workspaceNativePath, branch);
    } else {
      args.push('-b', branch, workspaceNativePath, revisionOrHead(source.base));
    }
    await fs.mkdir(path.dirname(workspaceNativePath), { recursive: true });
    await repository.git.run(args);

    const workspace = await this.#store.createWorkspace({
      project_id: project.id,
      name,
      absolute_path: toProtocolPath(workspaceNativePath),
    });
    return toWorkspace(workspace, { case: 'ok', value: { branch } });
  }

  async #addExistingWorkspace(project: ProjectRow, source: CreateWorkspaceRequest_Existing): Promise<WorkspaceInit> {
    const workspaceNativePath = await canonicalPath(toNativeRoot(source.absolutePath));
    await this.#refuseStoredWorkspace(workspaceNativePath);
    await refuseNonDirectory(workspaceNativePath);
    const repository = await this.#refuseUnhealthyProject(project);
    const worktree = await findWorktree(repository.worktrees, workspaceNativePath);
    if (!worktree || worktree.main) {
      throw new TransportError(
        Code.FAILED_PRECONDITION,
        "the folder is not a linked worktree of the project's repository",
      );
    }
    const name = source.name === '' ? path.basename(workspaceNativePath) : source.name;
    const workspace = await this.#store.createWorkspace({
      project_id: project.id,
      name,
      absolute_path: toProtocolPath(workspaceNativePath),
    });
    return toWorkspace(workspace, worktreeState(worktree));
  }

  /** Generates a name for a workspace. */
  async #generateWorkspaceName(project: ProjectRow, repository: Repository): Promise<string> {
    const taken = new Set((await this.#store.getWorkspaces(project.id)).map((row) => row.name));
    const free = async (name: string): Promise<boolean> =>
      !taken.has(name) &&
      !(await hasBranch(repository.git, name)) &&
      !(await exists(path.join(this.#code.workspaces, project.folder, name)));
    let animal = '';
    for (let attempt = 0; attempt < WORKSPACE_NAME_ATTEMPTS; attempt++) {
      animal = randomAnimal();
      if (await free(animal)) {
        return animal;
      }
    }
    for (let n = 2; ; n++) {
      const name = `${animal}-${n}`;
      if (await free(name)) {
        return name;
      }
    }
  }

  /**
   * Picks the project's folder and where its repository goes.
   *
   * Selects the folder at `main` when `mainWorkspaceProtocolPath` is empty. Fails when the path is stored or occupied.
   */
  async #allocateProjectPaths(
    name: string,
    mainWorkspaceProtocolPath: string,
  ): Promise<{ folder: string; mainWorkspaceNativePath: string }> {
    const folder = await this.#allocateProjectFolder(name);
    const mainWorkspaceNativePath = await canonicalPath(
      mainWorkspaceProtocolPath === ''
        ? path.join(this.#code.workspaces, folder, 'main')
        : toNativeRoot(mainWorkspaceProtocolPath),
    );
    await this.#refuseStoredWorkspace(mainWorkspaceNativePath);
    await refuseOccupiedPath(mainWorkspaceNativePath, 'empty');
    return { folder, mainWorkspaceNativePath };
  }

  /** Allocates a project's folder under the code directory. */
  async #allocateProjectFolder(name: string): Promise<string> {
    const base = kebabCase(name);
    if (base === '') {
      throw new TransportError(Code.INVALID_ARGUMENT, 'the name needs a letter or a digit to make a folder name of');
    }
    for (let n = 1; ; n++) {
      const folder = n === 1 ? base : `${base}-${n}`;
      if (!(await this.#store.hasProjectFolder(folder)) && !(await exists(path.join(this.#code.workspaces, folder)))) {
        return folder;
      }
    }
  }

  /** Stores a project along with the repository's main worktree. */
  async #storeProject(name: string, folder: string, mainWorkspaceNativePath: string): Promise<ProjectInit> {
    const { project } = await this.#store.createProject({
      name,
      folder,
      absolute_path: toProtocolPath(mainWorkspaceNativePath),
    });
    return toProject(project, { case: 'ok', value: {} });
  }

  async #refuseStoredWorkspace(nativePath: string): Promise<void> {
    if (await this.#store.findWorkspaceByPath(toProtocolPath(nativePath))) {
      throw new TransportError(Code.ALREADY_EXISTS, 'a project or workspace is already at the path');
    }
  }

  async #refuseMissingProject(projectId: string): Promise<ProjectRow> {
    const row = await this.#store.getProject(projectId);
    if (!row) {
      throw new TransportError(Code.NOT_FOUND, 'the project does not exist');
    }
    return row;
  }

  async #refuseMissingWorkspace(projectId: string, workspaceId: string): Promise<WorkspaceRow> {
    const row = await this.#store.getWorkspace(projectId, workspaceId);
    if (!row) {
      throw new TransportError(Code.NOT_FOUND, 'the workspace does not exist');
    }
    return row;
  }

  async #refuseUnhealthyProject(project: ProjectRow): Promise<Repository> {
    const { state, repository } = await this.#inspectProject(project);
    if (!repository) {
      throw new TransportError(Code.FAILED_PRECONDITION, `the project is ${state.case}`);
    }
    return repository;
  }

  /** Verify the state of a project. */
  async #inspectProject(project: ProjectRow): Promise<{ state: ProjectState; repository?: Repository }> {
    const mainWorkspaceNativePath = path.resolve(project.absolute_path);
    const kind = await kindOf(mainWorkspaceNativePath);
    if (kind !== 'directory') {
      return { state: { case: kind === 'missing' ? 'missing' : 'broken', value: {} } };
    }
    const git = new Git(mainWorkspaceNativePath, this.#options.readLimitBytes);
    let worktrees: WorktreeInit[];
    try {
      worktrees = await readWorktrees(git);
    } catch (error) {
      if (error instanceof GitError) {
        return { state: { case: 'broken', value: {} } }; // Not a repository.
      }
      throw error;
    }
    if (!(await findWorktree(worktrees, mainWorkspaceNativePath))?.main) {
      return { state: { case: 'broken', value: {} } };
    }
    return { state: { case: 'ok', value: {} }, repository: { git, worktrees } };
  }

  async #projectOf(project: ProjectRow): Promise<ProjectInit> {
    return toProject(project, (await this.#inspectProject(project)).state);
  }

  async #workspaceOf(workspace: WorkspaceRow, repository: Repository | undefined): Promise<WorkspaceInit> {
    return toWorkspace(workspace, await workspaceState(workspace, repository));
  }

  /** Deletes a project's repository from disk including every linked worktree. */
  async #deleteProjectFiles(project: ProjectRow): Promise<void> {
    const { repository } = await this.#inspectProject(project);
    const workspaces = await this.#store.getWorkspaces(project.id);
    const linkedWorktreeNativePaths = new Set(
      workspaces.filter((workspace) => workspace.main === 0).map((workspace) => path.resolve(workspace.absolute_path)),
    );
    for (const worktree of repository?.worktrees.filter((worktree) => !worktree.main) ?? []) {
      if (worktree.absolutePath) {
        // Sanity check as an empty path would resolve to the current working directory.
        linkedWorktreeNativePaths.add(path.resolve(worktree.absolutePath));
      }
    }
    for (const linkedWorktreeNativePath of linkedWorktreeNativePaths) {
      await fs.rm(linkedWorktreeNativePath, { recursive: true, force: true });
    }
    await fs.rm(path.resolve(project.absolute_path), { recursive: true, force: true });
    // Deletes whatever is left in the project folder.
    await fs.rm(path.join(this.#code.workspaces, project.folder), { recursive: true, force: true });
  }

  /** Deletes a linked worktree from disk and optionally the branch. */
  async #deleteWorkspaceFiles(project: ProjectRow, workspace: WorkspaceRow, deleteBranch: boolean): Promise<void> {
    const { repository } = await this.#inspectProject(project);
    const workspaceNativePath = path.resolve(workspace.absolute_path);
    const worktree = repository && (await findWorktree(repository.worktrees, workspaceNativePath));
    if (repository && worktree && (await kindOf(workspaceNativePath)) === 'directory') {
      await repository.git.run(['worktree', 'remove', '--force', '--force', workspaceNativePath]);
    } else {
      await fs.rm(workspaceNativePath, { recursive: true, force: true });
      await repository?.git.run(['worktree', 'prune']);
    }
    await deleteProjectFolder(path.join(this.#code.workspaces, project.folder));
    const branch = worktree?.branch ?? '';
    if (deleteBranch && repository && branch !== '') {
      await repository.git.run(['branch', '--delete', '--force', branch]);
    }
  }
}

function toProject(project: ProjectRow, state: ProjectState): ProjectInit {
  return { id: project.id, name: project.name, absolutePath: project.absolute_path, state };
}

function toWorkspace(workspace: WorkspaceRow, state: WorkspaceState): WorkspaceInit {
  return {
    projectId: workspace.project_id,
    id: workspace.id,
    name: workspace.name,
    absolutePath: workspace.absolute_path,
    main: workspace.main === 1,
    state,
  };
}

async function workspaceState(workspace: WorkspaceRow, repository: Repository | undefined): Promise<WorkspaceState> {
  const workspaceNativePath = path.resolve(workspace.absolute_path);
  const kind = await kindOf(workspaceNativePath);
  if (kind !== 'directory') {
    return { case: kind === 'missing' ? 'missing' : 'broken', value: {} };
  }
  const worktree = repository && (await findWorktree(repository.worktrees, workspaceNativePath));
  return worktree ? worktreeState(worktree) : { case: 'broken', value: {} };
}

function worktreeState(worktree: WorktreeInit): WorkspaceState {
  const branch = worktree.branch ?? '';
  return branch === '' ? { case: 'detached', value: {} } : { case: 'ok', value: { branch } };
}

/** Deletes the folder the daemon made for the project's workspaces once the last workspace is deleted. */
async function deleteProjectFolder(projectFolderNativePath: string): Promise<void> {
  try {
    await fs.rmdir(projectFolderNativePath);
  } catch (error) {
    if (errnoOf(error) !== 'ENOTEMPTY' && errnoOf(error) !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Resolves the symlinks in a paths that have yet to exist.
 *
 * Similar to `fs.realpath()` but works on paths that do not currently exist.
 */
async function canonicalPath(nativePath: string): Promise<string> {
  const missing: string[] = [];
  let current = nativePath;
  for (;;) {
    try {
      return path.join(await fs.realpath(current), ...missing);
    } catch (error) {
      const parent = path.dirname(current);
      if ((errnoOf(error) !== 'ENOENT' && errnoOf(error) !== 'ENOTDIR') || parent === current) {
        throw error;
      }
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function refuseNonDirectory(nativePath: string): Promise<void> {
  if (!(await fs.stat(nativePath)).isDirectory()) {
    throw new TransportError(Code.FAILED_PRECONDITION, 'the path is not a directory');
  }
}

async function exists(nativePath: string): Promise<boolean> {
  return (await kindOf(nativePath)) !== 'missing';
}

/** Returns if a native path is a directory. */
async function kindOf(nativePath: string): Promise<'directory' | 'other' | 'missing'> {
  try {
    return (await fs.stat(nativePath)).isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if (errnoOf(error) === 'ENOENT' || errnoOf(error) === 'ENOTDIR') {
      return 'missing';
    }
    throw error;
  }
}
