import { create } from '@bufbuild/protobuf';
import { DEFAULT_PROJECT_LAYOUT, type ProjectLayout } from '@elsewise/bridge';
import { SidebarContent } from '@elsewise/components/components/sidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  BranchSchema,
  Progress_Phase,
  ProgressSchema,
  TagSchema,
  WorktreeSchema,
} from '@/gen/elsewise/daemon/git/v1/git_pb';
import {
  GetBranchesResponseSchema,
  GetTagsResponseSchema,
  GetWorktreesResponseSchema,
  GitService,
} from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import {
  CloneProjectResponseSchema,
  CreateProjectResponseSchema,
  CreateWorkspaceResponseSchema,
  DeleteProjectResponseSchema,
  DeleteWorkspaceResponseSchema,
  GetNewWorkspaceNameResponseSchema,
  GetProjectsResponseSchema,
  GetWorkspacesResponseSchema,
  type Project,
  ProjectSchema,
  UpdateProjectResponseSchema,
  UpdateWorkspaceResponseSchema,
  type Workspace,
  WorkspaceSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { projectLayoutQuery } from '@/projects/layout';
import { ProjectManager } from '@/projects/project-manager';
import { Projects } from '@/routes/_shell/-projects/projects';
import { builtInApplication } from './commands';

// A daemon with two projects, which generates the workspace name otter, or heron once a workspace is created, adds a
// detached workspace named Lisbon, recording each request in `created`, and a project named after its folder. It
// deletes a workspace once `deletion.until` settles, or fails with `deletion.error`, and records each it deletes in
// `deleted`. The projects and workspaces with an id in `unavailable` have its state. The dotfiles repository has
// branches main (in Tokyo), feat-x, feat-y (in a worktree no workspace has) and feat-z (only on origin), and tag v1.0,
// and worktrees dotfiles-spike, dotfiles-detached and dotfiles-hanoi (in Hanoi) beside those of main and feat-y.
function fakeDaemon(
  created: Parameters<Daemon['projects']['createWorkspace']>[0][],
  deleted: DeletedWorkspace[],
  deletion: Deletion,
  unavailable: Record<string, 'missing' | 'broken'>,
): Daemon {
  // Returns the state in `unavailable` of the project or workspace with `id`, else `ok`.
  const stateOf = <const T,>(id: string, ok: T) => {
    const state = unavailable[id];
    return state ? ({ case: state, value: {} } as const) : ok;
  };
  const projects: Project[] = [
    create(ProjectSchema, {
      id: 'elsewise',
      name: 'elsewise',
      absolutePath: '/elsewise',
      state: stateOf('elsewise', { case: 'ok', value: {} }),
    }),
    create(ProjectSchema, {
      id: 'dotfiles',
      name: 'dotfiles',
      absolutePath: '/dotfiles',
      state: stateOf('dotfiles', { case: 'ok', value: {} }),
    }),
  ];
  const workspaces: Workspace[] = [
    create(WorkspaceSchema, {
      projectId: 'elsewise',
      id: 'singapore',
      name: 'Singapore',
      main: true,
      state: stateOf('singapore', { case: 'ok', value: { branch: 'main' } }),
    }),
    create(WorkspaceSchema, {
      projectId: 'elsewise',
      id: 'dhaka',
      name: 'Dhaka',
      absolutePath: '/elsewise/dhaka',
      state: stateOf('dhaka', { case: 'ok', value: { branch: 'dhaka' } }),
    }),
    create(WorkspaceSchema, {
      projectId: 'dotfiles',
      id: 'tokyo',
      name: 'Tokyo',
      main: true,
      absolutePath: '/dotfiles',
      state: stateOf('tokyo', { case: 'ok', value: { branch: 'main' } }),
    }),
    create(WorkspaceSchema, {
      projectId: 'dotfiles',
      id: 'hanoi',
      name: 'Hanoi',
      absolutePath: '/dotfiles-hanoi',
      state: stateOf('hanoi', { case: 'ok', value: { branch: 'hanoi' } }),
    }),
  ];
  const unused = () => {
    throw new Error('not faked');
  };
  // Adds a project with a main workspace at `absolutePath`, its id the folder's name and `name` defaulting to it.
  const addProject = (name: string, absolutePath: string) => {
    const folder = absolutePath.split('/').at(-1) ?? '';
    const project = create(ProjectSchema, {
      id: folder,
      name: name || folder,
      absolutePath,
      state: { case: 'ok', value: {} },
    });
    projects.push(project);
    workspaces.push(
      create(WorkspaceSchema, {
        projectId: folder,
        id: 'main',
        name: 'Main',
        absolutePath,
        main: true,
        state: { case: 'ok', value: { branch: 'main' } },
      }),
    );
    return project;
  };
  const projectService = {
    updateProject: async ({ projectId, name }) => {
      const index = projects.findIndex((project) => project.id === projectId);
      const project = create(ProjectSchema, { ...projects[index], name: name ?? '' });
      projects[index] = project;
      return create(UpdateProjectResponseSchema, { project });
    },
    deleteProject: async ({ projectId }) => {
      projects.splice(
        projects.findIndex((project) => project.id === projectId),
        1,
      );
      return create(DeleteProjectResponseSchema);
    },
    updateWorkspace: async ({ workspaceId, name }) => {
      const index = workspaces.findIndex((workspace) => workspace.id === workspaceId);
      const workspace = create(WorkspaceSchema, { ...workspaces[index], name: name ?? '' });
      workspaces[index] = workspace;
      return create(UpdateWorkspaceResponseSchema, { workspace });
    },
    deleteWorkspace: async ({ workspaceId, deleteFiles, deleteBranch }) => {
      await deletion.until;
      if (deletion.error) {
        throw deletion.error;
      }

      deleted.push({ workspaceId, deleteFiles, deleteBranch });
      workspaces.splice(
        workspaces.findIndex((workspace) => workspace.id === workspaceId),
        1,
      );
      return create(DeleteWorkspaceResponseSchema);
    },
    getProjects: async () => create(GetProjectsResponseSchema, { projects }),
    getWorkspaces: async ({ projectId }) =>
      create(GetWorkspacesResponseSchema, { workspaces: workspaces.filter((w) => w.projectId === projectId) }),
    getNewWorkspaceName: async () =>
      create(GetNewWorkspaceNameResponseSchema, { name: created.length === 0 ? 'otter' : 'heron' }),
    createWorkspace: async (request) => {
      created.push(request);
      const workspace = create(WorkspaceSchema, {
        projectId: request.projectId,
        id: 'lisbon',
        name: 'Lisbon',
        state: { case: 'detached', value: {} },
      });
      workspaces.push(workspace);
      return create(CreateWorkspaceResponseSchema, { workspace });
    },
    createProject: async ({ source }) => {
      const absolutePath =
        source?.value?.absolutePath || `/projects/${(source?.value?.name ?? '').toLowerCase().replace(/\W+/g, '-')}`;
      return create(CreateProjectResponseSchema, { project: addProject(source?.value?.name ?? '', absolutePath) });
    },
    cloneProject: async function* ({ url, name, absolutePath }) {
      yield create(CloneProjectResponseSchema, {
        event: { case: 'progress', value: create(ProgressSchema, { phase: Progress_Phase.RECEIVING, percent: 100 }) },
      });
      const folder =
        url
          ?.split('/')
          .at(-1)
          ?.replace(/\.git$/, '') ?? '';
      yield create(CloneProjectResponseSchema, {
        event: { case: 'project', value: addProject(name ?? '', absolutePath || `/projects/${folder}`) },
      });
    },
  } satisfies Daemon['projects'];
  const fileSystem = {
    watchDirectories: unused,
    watchFiles: unused,
    watchRoots: unused,
    listDirectory: unused,
    readFile: unused,
    writeFile: unused,
    createDirectory: unused,
    renameEntry: unused,
    deleteEntry: unused,
  } satisfies Daemon['fileSystem'];
  const git = {
    ...(Object.fromEntries(GitService.methods.map((method) => [method.localName, unused])) as unknown as Daemon['git']),
    getBranches: async () =>
      create(GetBranchesResponseSchema, {
        branches: [
          create(BranchSchema, { name: 'feat-x' }),
          create(BranchSchema, { name: 'feat-y', worktreeAbsolutePath: '/dotfiles-feat-y' }),
          create(BranchSchema, { name: 'main', worktreeAbsolutePath: '/dotfiles' }),
          create(BranchSchema, { name: 'origin/feat-z', remote: 'origin' }),
          create(BranchSchema, { name: 'origin/main', remote: 'origin' }),
        ],
      }),
    getTags: async () => create(GetTagsResponseSchema, { tags: [create(TagSchema, { name: 'v1.0' })] }),
    getWorktrees: async ({ absolutePath }) =>
      create(GetWorktreesResponseSchema, {
        worktrees: [
          create(WorktreeSchema, { absolutePath, branch: 'main', main: true }),
          ...(absolutePath === '/dotfiles'
            ? [
                create(WorktreeSchema, { absolutePath: '/dotfiles-feat-y', branch: 'feat-y' }),
                create(WorktreeSchema, { absolutePath: '/dotfiles-spike', branch: 'spike' }),
                create(WorktreeSchema, { absolutePath: '/dotfiles-detached' }),
                create(WorktreeSchema, { absolutePath: '/dotfiles-hanoi', branch: 'hanoi' }),
              ]
            : []),
        ],
      }),
  } satisfies Daemon['git'];
  return { fileSystem, git, projects: projectService };
}

interface DeletedWorkspace {
  workspaceId?: string;
  deleteFiles?: boolean;
  deleteBranch?: boolean;
}

interface Deletion {
  until: Promise<void>;
  error?: Error;
}

// Renders the sidebar beside an empty workspace route, at `path`, with `layout` loaded and the projects and workspaces in
// `unavailable` in its state, and returns what is saved, created and deleted, and the daemon's `deletion` to hold or
// fail deletes.
export async function mount(
  path: string,
  layout: ProjectLayout = DEFAULT_PROJECT_LAYOUT,
  unavailable: Record<string, 'missing' | 'broken'> = {},
) {
  const saved: ProjectLayout[] = [];
  const created: Parameters<Daemon['projects']['createWorkspace']>[0][] = [];
  const deleted: DeletedWorkspace[] = [];
  const deletion: Deletion = { until: Promise.resolve() };
  window.bridge = {
    ...window.bridge,
    projects: { load: async () => layout, save: async (next) => void saved.push(next) },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, fakeDaemon(created, deleted, deletion, unavailable));
  client.setQueryData(projectLayoutQuery.queryKey, layout);
  const root = createRootRoute({
    component: () => (
      <>
        <SidebarContent>
          <Projects />
        </SidebarContent>
        <Outlet />
      </>
    ),
  });
  const workspace = createRoute({ getParentRoute: () => root, path: '/$daemon/$project/$workspace' });
  const router = createRouter({
    routeTree: root.addChildren([workspace]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const projects = new ProjectManager(client, router);
  const application = builtInApplication({ projects, router });
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <RouterProvider router={router} />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return { router, projects, commands: application.commands, saved, created, deleted, deletion };
}

// Waits for running animations to end, then returns the opacity of each dialog backdrop and popup in every frame while
// `act` runs and for 300ms after.
export async function sampleDialogs(act: () => Promise<void>) {
  await expect.poll(() => document.getAnimations().length).toBe(0);
  const frames: { backdrops: string[]; popups: string[] }[] = [];
  let sampling = true;
  const sample = () => {
    frames.push({
      backdrops: [...document.querySelectorAll('[data-slot="dialog-overlay"]')].map(
        (element) => getComputedStyle(element).opacity,
      ),
      popups: [...document.querySelectorAll('[data-slot="dialog-content"]')].map(
        (element) => getComputedStyle(element).opacity,
      ),
    });
    if (sampling) {
      requestAnimationFrame(sample);
    }
  };
  requestAnimationFrame(sample);
  await act();
  await new Promise((resolve) => setTimeout(resolve, 300));
  sampling = false;
  return frames;
}
