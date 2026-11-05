import { create } from '@bufbuild/protobuf';
import { DEFAULT_PROJECT_LAYOUT, type ProjectLayout } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON } from '@/daemon';
import { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import {
  CreateProjectResponseSchema,
  CreateWorkspaceResponseSchema,
  DeleteWorkspaceResponseSchema,
  GetProjectsResponseSchema,
  GetWorkspacesResponseSchema,
  type Project,
  ProjectSchema,
  type Workspace,
  WorkspaceSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { projectLayoutQuery } from '@/projects/layout';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../test/commands';
import { Projects } from './projects';

afterEach(() => {
  window.bridge = undefined;
});

// A daemon with two projects, which adds a workspace named Lisbon and a project named after its folder. It deletes a
// workspace once `deletion.until` settles, or fails with `deletion.error`, and records each it deletes in `deleted`.
function fakeDaemon(deleted: DeletedWorkspace[], deletion: Deletion): Daemon {
  const projects: Project[] = [
    create(ProjectSchema, { id: 'elsewise', name: 'elsewise' }),
    create(ProjectSchema, { id: 'dotfiles', name: 'dotfiles' }),
  ];
  const workspaces: Workspace[] = [
    create(WorkspaceSchema, { projectId: 'elsewise', id: 'singapore', name: 'Singapore', main: true }),
    create(WorkspaceSchema, {
      projectId: 'elsewise',
      id: 'dhaka',
      name: 'Dhaka',
      state: { case: 'ok', value: { branch: 'dhaka' } },
    }),
    create(WorkspaceSchema, { projectId: 'dotfiles', id: 'tokyo', name: 'Tokyo', main: true }),
  ];
  const unused = () => {
    throw new Error('not faked');
  };
  const projectService = {
    cloneProject: unused,
    updateProject: unused,
    deleteProject: unused,
    updateWorkspace: unused,
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
    createWorkspace: async ({ projectId }) => {
      const workspace = create(WorkspaceSchema, { projectId, id: 'lisbon', name: 'Lisbon' });
      workspaces.push(workspace);
      return create(CreateWorkspaceResponseSchema, { workspace });
    },
    createProject: async ({ source }) => {
      const name = source?.case === 'existing' ? (source.value.absolutePath?.split('/').at(-1) ?? '') : '';
      const project = create(ProjectSchema, { id: name, name });
      projects.push(project);
      return create(CreateProjectResponseSchema, { project });
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
  const git = Object.fromEntries(
    GitService.methods.map((method) => [method.localName, unused]),
  ) as unknown as Daemon['git'];
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

// Renders the sidebar beside an empty workspace route, at `path`, with `layout` loaded, and returns what is saved and
// deleted, and the daemon's `deletion` to hold or fail deletes.
async function mount(path: string, layout: ProjectLayout = DEFAULT_PROJECT_LAYOUT) {
  const saved: ProjectLayout[] = [];
  const deleted: DeletedWorkspace[] = [];
  const deletion: Deletion = { until: Promise.resolve() };
  window.bridge = {
    ...window.bridge,
    projects: { load: async () => layout, save: async (next) => void saved.push(next) },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON).queryKey, fakeDaemon(deleted, deletion));
  client.setQueryData(projectLayoutQuery.queryKey, layout);
  const root = createRootRoute({
    component: () => (
      <>
        <Projects />
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
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={builtInApplication({ projects })}>
        <RouterProvider router={router} />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return { router, projects, saved, deleted, deletion };
}

// Returns the names of the projects and their workspaces, in the order shown.
function names() {
  return (
    [...document.querySelectorAll('[data-sidebar="menu-row-label"], [data-sidebar="menu-sub-button"]')]
      // A drop leaves the dragged item's placeholder copy until its animation ends.
      .filter((element) => !element.closest('[data-dnd-placeholder]'))
      .map((element) => element.lastElementChild?.textContent)
      .filter((name) => name !== 'New workspace')
  );
}

describe('Projects', () => {
  test('highlights current workspace', async () => {
    await mount('/local/elsewise/dhaka');

    await expect.element(page.getByRole('link', { name: 'Dhaka' })).toHaveAttribute('data-active');
    await expect.element(page.getByRole('link', { name: 'Singapore' })).not.toHaveAttribute('data-active');
  });

  test('collapses project', async () => {
    await mount('/local/elsewise/singapore');
    await expect.element(page.getByRole('link', { name: 'Dhaka' })).toBeVisible();

    await page.getByRole('button', { name: 'elsewise', exact: true }).click();

    await expect.element(page.getByRole('link', { name: 'Dhaka' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('link', { name: 'Tokyo' })).toBeVisible();
  });

  test('saves collapse', async () => {
    const { saved } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'elsewise', exact: true }).click();

    await expect
      .poll(() => saved.at(-1)?.daemons.local?.projects.find(({ id }) => id === 'elsewise')?.expanded)
      .toBe(false);
  });

  test('collapses per layout', async () => {
    await mount('/local/elsewise/singapore', {
      daemons: { local: { projects: [{ id: 'elsewise', expanded: false, workspaces: [] }] } },
    });

    await expect.element(page.getByRole('link', { name: 'Tokyo' })).toBeVisible();
    await expect.element(page.getByRole('link', { name: 'Dhaka' })).not.toBeInTheDocument();
  });

  test('sorts per layout', async () => {
    await mount('/local/elsewise/singapore', {
      daemons: {
        local: {
          projects: [
            { id: 'dotfiles', expanded: true, workspaces: [] },
            { id: 'elsewise', expanded: true, workspaces: ['dhaka'] },
          ],
        },
      },
    });

    await expect.poll(names).toEqual(['dotfiles', 'Tokyo', 'elsewise', 'Dhaka', 'Singapore']);
  });

  test('moves dragged project', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);

    await userEvent.dragAndDrop(
      page.getByRole('button', { name: 'dotfiles', exact: true }),
      page.getByRole('button', { name: 'elsewise', exact: true }),
    );

    await expect.poll(names).toEqual(['dotfiles', 'Tokyo', 'elsewise', 'Singapore', 'Dhaka']);
    expect(saved.at(-1)?.daemons.local?.projects.map(({ id }) => id)).toEqual(['dotfiles', 'elsewise']);
  });

  test('moves dragged workspace', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);

    await userEvent.dragAndDrop(
      page.getByRole('link', { name: 'Dhaka' }),
      page.getByRole('link', { name: 'Singapore' }),
    );

    await expect.poll(names).toEqual(['elsewise', 'Dhaka', 'Singapore', 'dotfiles', 'Tokyo']);
    expect(saved.at(-1)?.daemons.local?.projects.find(({ id }) => id === 'elsewise')?.workspaces).toEqual([
      'dhaka',
      'singapore',
    ]);
  });

  test('keeps workspace within project', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);

    await userEvent.dragAndDrop(page.getByRole('link', { name: 'Dhaka' }), page.getByRole('link', { name: 'Tokyo' }));

    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);
    expect(saved).toEqual([]);
  });

  test('opens workspace', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('link', { name: 'Tokyo' }).click();

    await expect.element(page.getByRole('link', { name: 'Tokyo' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/tokyo');
  });

  test('adds workspace and opens it', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('link', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
  });

  test('describes main workspace', async () => {
    await mount('/local/elsewise/singapore');

    await expect
      .element(page.getByRole('link', { name: 'Singapore' }))
      .toHaveAccessibleDescription('Idle Main workspace');
    await expect.element(page.getByRole('link', { name: 'Dhaka' })).toHaveAccessibleDescription('Idle');
  });

  test('deletes workspace', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.element(page.getByRole('link', { name: 'Dhaka' })).not.toBeInTheDocument();
    expect(deleted).toEqual([{ workspaceId: 'dhaka', deleteFiles: false, deleteBranch: false }]);
  });

  test('deletes files and branch', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('radio', { name: 'Delete files and dhaka branch' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => deleted).toEqual([{ workspaceId: 'dhaka', deleteFiles: true, deleteBranch: true }]);
  });

  test('omits branch without one checked out', async () => {
    await mount('/local/elsewise/singapore');
    await page.getByRole('button', { name: 'New workspace in elsewise' }).click();

    await page.getByRole('button', { name: 'Delete Lisbon' }).click();

    await expect.element(page.getByRole('radio', { name: 'Keep files' })).toBeInTheDocument();
    await expect.element(page.getByRole('radio', { name: 'Delete files' })).toBeInTheDocument();
    await expect.element(page.getByRole('radio', { name: /^Delete files and / })).not.toBeInTheDocument();
  });

  test('spares main workspace', async () => {
    await mount('/local/elsewise/singapore');
    await expect.element(page.getByRole('button', { name: 'Delete Dhaka' })).toBeInTheDocument();

    await expect.element(page.getByRole('button', { name: 'Delete Singapore' })).not.toBeInTheDocument();
  });

  test('opens main workspace after deleting shown one', async () => {
    const { router } = await mount('/local/elsewise/dhaka');

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => router.state.location.pathname).toBe('/local/elsewise/singapore');
  });

  test('locks dialog while deleting', async () => {
    const { deletion } = await mount('/local/elsewise/singapore');
    let release = () => {};
    deletion.until = new Promise((resolve) => {
      release = resolve;
    });

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await userEvent.keyboard('{Escape}');

    await expect
      .element(page.getByRole('button', { name: 'Delete', exact: true }))
      .toHaveAttribute('aria-busy', 'true');
    await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    release();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('keeps dialog open after failure', async () => {
    const { deleted, deletion } = await mount('/local/elsewise/singapore');
    deletion.error = new Error('worktree has changes');

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('radio', { name: 'Delete files' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
    await expect.element(page.getByRole('radio', { name: 'Delete files' })).toBeChecked();
    expect(deleted).toEqual([]);
  });

  test('describes workspace by status', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addStatus({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' }, 'running');

    await expect.element(page.getByRole('link', { name: 'Dhaka' })).toHaveAccessibleDescription('Running');
  });

  test('adds project from picked folder', async () => {
    window.bridge = {
      window: {
        cut() {},
        copy() {},
        paste() {},
        pickFolder: async () => '/Users/me/notes',
        pickFile: async () => null,
        setBrightness() {},
        setBackground() {},
        onClose() {},
      },
    };
    await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('button', { name: 'notes', exact: true })).toBeVisible();
  });
});
