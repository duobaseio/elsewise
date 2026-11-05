import { create } from '@bufbuild/protobuf';
import { DEFAULT_PROJECT_LAYOUT, type ProjectLayout } from '@elsewise/bridge';
import { SidebarContent } from '@elsewise/components/components/sidebar';
import { DEFAULT_COMMAND_GROUPS, type ProjectCommand, type WorkspaceCommand } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import {
  CreateProjectResponseSchema,
  CreateWorkspaceResponseSchema,
  DeleteProjectResponseSchema,
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
  vi.restoreAllMocks();
});

// A daemon with two projects, which adds a detached workspace named Lisbon and a project named after its folder. It
// deletes a workspace once `deletion.until` settles, or fails with `deletion.error`, and records each it deletes in
// `deleted`. The projects and workspaces with an id in `unavailable` have its state.
function fakeDaemon(
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
    create(ProjectSchema, { id: 'elsewise', name: 'elsewise', state: stateOf('elsewise', { case: 'ok', value: {} }) }),
    create(ProjectSchema, { id: 'dotfiles', name: 'dotfiles', state: stateOf('dotfiles', { case: 'ok', value: {} }) }),
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
      state: stateOf('tokyo', { case: 'ok', value: { branch: 'main' } }),
    }),
  ];
  const unused = () => {
    throw new Error('not faked');
  };
  const projectService = {
    cloneProject: unused,
    updateProject: unused,
    deleteProject: async ({ projectId }) => {
      projects.splice(
        projects.findIndex((project) => project.id === projectId),
        1,
      );
      return create(DeleteProjectResponseSchema);
    },
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
      const workspace = create(WorkspaceSchema, {
        projectId,
        id: 'lisbon',
        name: 'Lisbon',
        state: { case: 'detached', value: {} },
      });
      workspaces.push(workspace);
      return create(CreateWorkspaceResponseSchema, { workspace });
    },
    createProject: async ({ source }) => {
      const name = source?.case === 'existing' ? (source.value.absolutePath?.split('/').at(-1) ?? '') : '';
      const project = create(ProjectSchema, { id: name, name, state: { case: 'ok', value: {} } });
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

// Renders the sidebar beside an empty workspace route, at `path`, with `layout` loaded and the projects and workspaces in
// `unavailable` in its state, and returns what is saved and deleted, and the daemon's `deletion` to hold or fail
// deletes.
async function mount(
  path: string,
  layout: ProjectLayout = DEFAULT_PROJECT_LAYOUT,
  unavailable: Record<string, 'missing' | 'broken'> = {},
) {
  const saved: ProjectLayout[] = [];
  const deleted: DeletedWorkspace[] = [];
  const deletion: Deletion = { until: Promise.resolve() };
  window.bridge = {
    ...window.bridge,
    projects: { load: async () => layout, save: async (next) => void saved.push(next) },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, fakeDaemon(deleted, deletion, unavailable));
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
  return { router, projects, commands: application.commands, saved, deleted, deletion };
}

// Returns the names of the projects and their workspaces, in the order shown.
function names() {
  return (
    [...document.querySelectorAll('[data-sidebar="menu-row-label"], [data-sidebar="menu-sub-row-label"]')]
      // A drop leaves the dragged item's placeholder copy until its animation ends.
      .filter((element) => !element.closest('[data-dnd-placeholder]'))
      .map((element) => element.lastElementChild?.textContent)
  );
}

// Returns the names of the buttons in the row of the workspace named `workspace`, in the order shown.
function buttons(workspace: string) {
  const row = page.getByRole('treeitem', { name: workspace }).element().closest('[data-sidebar="menu-sub-row"]');
  return [...(row?.querySelectorAll('button') ?? [])].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent,
  );
}

describe('Projects', () => {
  test('highlights current workspace', async () => {
    await mount('/local/elsewise/dhaka');

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAttribute('data-active');
    await expect.element(page.getByRole('treeitem', { name: 'Singapore' })).not.toHaveAttribute('data-active');
  });

  test('collapses project', async () => {
    await mount('/local/elsewise/singapore');
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toBeVisible();

    await page.getByRole('treeitem', { name: 'elsewise', exact: true }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).toBeVisible();
  });

  test('saves collapse', async () => {
    const { saved } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'elsewise', exact: true }).click();

    await expect
      .poll(() => saved.at(-1)?.daemons.local?.projects.find(({ id }) => id === 'elsewise')?.expanded)
      .toBe(false);
  });

  test('collapses per layout', async () => {
    await mount('/local/elsewise/singapore', {
      daemons: { local: { projects: [{ id: 'elsewise', expanded: false, workspaces: [] }] } },
    });

    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).toBeVisible();
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).not.toBeInTheDocument();
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
      page.getByRole('treeitem', { name: 'dotfiles', exact: true }),
      page.getByRole('treeitem', { name: 'elsewise', exact: true }),
    );

    await expect.poll(names).toEqual(['dotfiles', 'Tokyo', 'elsewise', 'Singapore', 'Dhaka']);
    expect(saved.at(-1)?.daemons.local?.projects.map(({ id }) => id)).toEqual(['dotfiles', 'elsewise']);
  });

  test('moves dragged workspace', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'Dhaka' }),
      page.getByRole('treeitem', { name: 'Singapore' }),
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

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'Dhaka' }),
      page.getByRole('treeitem', { name: 'Tokyo' }),
    );

    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo']);
    expect(saved).toEqual([]);
  });

  test('opens workspace', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'Tokyo' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/tokyo');
  });

  test('adds workspace and opens it', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
  });

  test('describes main workspace', async () => {
    await mount('/local/elsewise/singapore');

    await expect
      .element(page.getByRole('treeitem', { name: 'Singapore' }))
      .toHaveAccessibleDescription('Idle Main workspace');
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAccessibleDescription('Idle');
  });

  test('deletes workspace', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).not.toBeInTheDocument();
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
    await page.getByRole('treeitem', { name: 'New workspace in elsewise' }).click();

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

  test('exposes projects as tree', async () => {
    await mount('/local/elsewise/singapore');
    const tree = page.getByRole('tree', { name: 'My workspaces' });
    const project = tree.getByRole('treeitem', { name: 'elsewise', exact: true });

    await expect.element(project).toHaveAttribute('aria-expanded', 'true');
    const group = document.getElementById(project.element().getAttribute('aria-owns') ?? '');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.contains(tree.getByRole('treeitem', { name: 'Dhaka' }).element())).toBe(true);
  });

  test('moves between rows by arrows', async () => {
    const { router } = await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Singapore' }).element().focus();

    await userEvent.keyboard('{ArrowDown}');
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/local/elsewise/singapore');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect.element(page.getByRole('treeitem', { name: 'dotfiles', exact: true })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect.element(page.getByRole('treeitem', { name: 'New workspace in elsewise' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect.element(page.getByRole('treeitem', { name: 'New workspace in dotfiles' })).toHaveFocus();
    await userEvent.keyboard('{Home}');

    await expect.element(page.getByRole('treeitem', { name: 'elsewise', exact: true })).toHaveFocus();
  });

  test('opens workspace on Enter', async () => {
    const { router } = await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Singapore' }).element().focus();

    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/elsewise/dhaka');
  });

  test('collapses and expands project by arrows', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(page.getByRole('treeitem', { name: 'elsewise', exact: true })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(page.getByRole('treeitem', { name: 'dotfiles', exact: true })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowRight}');
    await expect.element(page.getByRole('treeitem', { name: 'Singapore' })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');

    await expect.element(page.getByRole('treeitem', { name: 'Singapore' })).toHaveFocus();
  });

  test('tabs to current workspace only', async () => {
    await mount('/local/elsewise/dhaka');
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAttribute('tabindex', '0');

    await userEvent.tab();
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveFocus();
    await userEvent.tab();

    expect(document.activeElement?.closest('[data-sidebar="content"]')).toBeNull();
  });

  test('tabs to row last focused', async () => {
    await mount('/local/elsewise/singapore');
    const before = document.createElement('button');
    document.body.prepend(before);
    onTestFinished(() => before.remove());
    page.getByRole('treeitem', { name: 'Tokyo' }).element().focus();
    before.focus();

    await userEvent.tab();

    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).toHaveFocus();
  });

  test('opens delete dialog on Delete', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Delete}');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => deleted).toEqual([{ workspaceId: 'dhaka', deleteFiles: false, deleteBranch: false }]);
  });

  test('opens delete dialog on Backspace', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Backspace}');

    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
  });

  test('refocuses workspace after cancel', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Delete}');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveFocus();
  });

  test('spares main workspace on Delete', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Singapore' }).element().focus();

    await userEvent.keyboard('{Delete}');

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('describes workspace by status', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addStatus({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' }, 'running');

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAccessibleDescription('Running');
  });

  test('draws icons over their fallbacks', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.addIcons([
      { id: 'test.inner', order: 2, component: ({ project }) => <span data-testid={`inner-${project.name}`} /> },
      { id: 'test.outer', order: 1, component: ({ fallback }) => <span data-testid="outer">{fallback}</span> },
    ]);

    await expect.element(page.getByTestId('outer').first().getByTestId('inner-elsewise')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="file-icon"]')).toBeNull();
  });

  test('falls back from throwing icon', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.addIcons([
      {
        id: 'test.throwing',
        order: 1,
        component: () => {
          throw new Error('broken');
        },
      },
      { id: 'test.inner', order: 2, component: ({ project }) => <span data-testid={`inner-${project.name}`} /> },
    ]);

    await expect.element(page.getByTestId('inner-elsewise')).toBeInTheDocument();
  });

  test('draws icon in place of removed throwing one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { projects } = await mount('/local/elsewise/singapore');
    const dispose = projects.addIcons([
      {
        id: 'test.throwing',
        component: () => {
          throw new Error('broken');
        },
      },
    ]);
    await expect.poll(() => error).toHaveBeenCalledWith('Project icon test.throwing failed', expect.any(Error));

    dispose();
    projects.addIcons([{ id: 'test.next', component: ({ project }) => <span data-testid={`next-${project.name}`} /> }]);

    await expect.element(page.getByTestId('next-elsewise')).toBeInTheDocument();
  });

  test('shows item added again under same id', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { projects } = await mount('/local/elsewise/singapore');
    const dispose = projects.workspaces.addSidebarItems([
      {
        id: 'test.a',
        component: () => {
          throw new Error('broken');
        },
      },
    ]);
    await expect.poll(() => error).toHaveBeenCalledWith('Workspace sidebar item test.a failed', expect.any(Error));

    dispose();
    projects.workspaces.addSidebarItems([{ id: 'test.a', component: () => <button type="button">A</button> }]);

    await expect.poll(() => buttons('Dhaka')).toEqual(['A', 'Delete Dhaka']);
  });

  test('orders items from right', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addSidebarItems([
      { id: 'test.c', component: () => <button type="button">C</button> },
      { id: 'test.a', order: 1, component: () => <button type="button">A</button> },
      { id: 'test.b', order: 2, component: () => <button type="button">B</button> },
    ]);

    await expect.poll(() => buttons('Dhaka')).toEqual(['C', 'B', 'A', 'Delete Dhaka']);
  });

  test('skips duplicate item', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addSidebarItems([{ id: 'test.a', component: () => <button type="button">A</button> }]);
    projects.workspaces.addSidebarItems([{ id: 'test.a', component: () => <button type="button">B</button> }]);

    await expect.poll(() => buttons('Dhaka')).toEqual(['A', 'Delete Dhaka']);
  });

  test('hides throwing item', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addSidebarItems([
      {
        id: 'test.throwing',
        component: () => {
          throw new Error('broken');
        },
      },
      { id: 'test.a', component: () => <button type="button">A</button> },
    ]);

    await expect.poll(() => buttons('Dhaka')).toEqual(['A', 'Delete Dhaka']);
  });

  test('removes disposed items', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    const dispose = projects.workspaces.addSidebarItems([
      { id: 'test.a', component: () => <button type="button">A</button> },
    ]);
    await expect.poll(() => buttons('Dhaka')).toEqual(['A', 'Delete Dhaka']);

    dispose();

    await expect.poll(() => buttons('Dhaka')).toEqual(['Delete Dhaka']);
  });

  test('passes workspace to item', async () => {
    const { projects } = await mount('/local/elsewise/singapore');

    projects.workspaces.addSidebarItems([
      { id: 'test.name', component: ({ workspace }) => <button type="button">{workspace.id.workspace}</button> },
    ]);

    await expect.poll(() => buttons('Dhaka')).toEqual(['dhaka', 'Delete Dhaka']);
  });

  test('clicks workspace item without opening workspace', async () => {
    const { router, projects } = await mount('/local/elsewise/singapore');
    projects.workspaces.addSidebarItems([
      { id: 'test.a', component: ({ workspace }) => <button type="button">{`A ${workspace.name}`}</button> },
    ]);

    await page.getByRole('button', { name: 'A Dhaka' }).click();

    expect(router.state.location.pathname).toBe('/local/elsewise/singapore');
  });

  test('clicks project item without collapsing project', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.addSidebarItems([
      { id: 'test.a', component: ({ project }) => <button type="button">{`A ${project.name}`}</button> },
    ]);

    await page.getByRole('button', { name: 'A elsewise' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toBeVisible();
  });

  test('runs workspace command from context menu', async () => {
    const { projects, commands } = await mount('/local/elsewise/singapore');
    const run = vi.fn<WorkspaceCommand['run']>(() => true);
    commands.add([
      { id: 'test.run', label: 'Run', scope: 'workspace', group: DEFAULT_COMMAND_GROUPS.application.id, run },
    ]);
    projects.workspaces.addContextMenu([{ id: 'test', items: [{ command: 'test.run' }] }]);

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: 'Run' }).click();

    await expect.poll(() => run.mock.lastCall?.[1]).toMatchObject({ id: { workspace: 'dhaka' } });
  });

  test('runs project command from context menu', async () => {
    const { projects, commands } = await mount('/local/elsewise/singapore');
    const run = vi.fn<ProjectCommand['run']>(() => true);
    commands.add([
      { id: 'test.run', label: 'Run', scope: 'project', group: DEFAULT_COMMAND_GROUPS.application.id, run },
    ]);
    projects.addContextMenu([{ id: 'test', items: [{ command: 'test.run' }] }]);

    await userEvent.click(page.getByRole('treeitem', { name: 'elsewise', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: 'Run' }).click();

    await expect.poll(() => run.mock.lastCall?.[1]).toMatchObject({ id: { project: 'elsewise' } });
  });

  test('runs workspace command on its keys', async () => {
    const { commands } = await mount('/local/elsewise/singapore');
    const run = vi.fn<WorkspaceCommand['run']>(() => true);
    commands.add([
      {
        id: 'test.run',
        label: 'Run',
        scope: 'workspace',
        group: DEFAULT_COMMAND_GROUPS.application.id,
        defaultKeys: ['F6'],
        run,
      },
    ]);
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{F6}');

    expect(run.mock.lastCall?.[1]).toMatchObject({ id: { workspace: 'dhaka' } });
  });

  test('runs project command on its keys', async () => {
    const { commands } = await mount('/local/elsewise/singapore');
    const run = vi.fn<ProjectCommand['run']>(() => true);
    commands.add([
      {
        id: 'test.run',
        label: 'Run',
        scope: 'project',
        group: DEFAULT_COMMAND_GROUPS.application.id,
        defaultKeys: ['F6'],
        run,
      },
    ]);
    page.getByRole('treeitem', { name: 'elsewise', exact: true }).element().focus();

    await userEvent.keyboard('{F6}');

    expect(run.mock.lastCall?.[1]).toMatchObject({ id: { project: 'elsewise' } });
  });

  test('adds workspace from context menu and opens it', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^New workspace/ }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
  });

  test('resets finished status from context menu', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.workspaces.addStatus({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' }, 'finished');

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Mark as read/ }).click();

    expect(projects.workspaces.status({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' })).toBe('idle');
  });

  test('hides Mark as read unless finished', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: /^Copy path/ })).toBeVisible();
    expect(page.getByRole('menuitem', { name: /^Mark as read/ }).query()).toBeNull();
  });

  test('copies workspace path', async () => {
    await mount('/local/elsewise/singapore');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Copy path/ }).click();

    await expect.poll(() => writeText.mock.lastCall).toEqual(['/elsewise/dhaka']);
  });

  test('deletes workspace from context menu', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Delete…/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.poll(() => deleted).toEqual([{ workspaceId: 'dhaka', deleteFiles: false, deleteBranch: false }]);
  });

  test('hides Delete for main workspace', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'Singapore' }), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: /^Copy path/ })).toBeVisible();
    expect(page.getByRole('menuitem', { name: /^Delete…/ }).query()).toBeNull();
  });

  test('deletes project on Delete', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'dotfiles', exact: true }).element().focus();

    await userEvent.keyboard('{Delete}');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect.element(page.getByRole('treeitem', { name: 'dotfiles', exact: true })).not.toBeInTheDocument();
  });

  test('hides workspaces of missing project', async () => {
    await mount('/local/elsewise/singapore', DEFAULT_PROJECT_LAYOUT, { dotfiles: 'missing' });
    const project = page.getByRole('treeitem', { name: 'dotfiles', exact: true });

    await expect.element(project).toHaveAccessibleDescription('Folder missing');
    await expect.element(project).not.toHaveAttribute('aria-expanded');
    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'New workspace in dotfiles' })).not.toBeInTheDocument();
  });

  test('describes broken project', async () => {
    await mount('/local/elsewise/singapore', DEFAULT_PROJECT_LAYOUT, { dotfiles: 'broken' });

    await expect
      .element(page.getByRole('treeitem', { name: 'dotfiles', exact: true }))
      .toHaveAccessibleDescription('Not a git repository');
  });

  test('draws state over plugin icons', async () => {
    const { projects } = await mount('/local/elsewise/singapore', DEFAULT_PROJECT_LAYOUT, { dotfiles: 'missing' });

    projects.addIcons([{ id: 'test.icon', component: ({ project }) => <span data-testid={`icon-${project.name}`} /> }]);

    await expect.element(page.getByTestId('icon-elsewise')).toBeInTheDocument();
    await expect.element(page.getByTestId('icon-dotfiles')).not.toBeInTheDocument();
  });

  test('describes missing workspace', async () => {
    await mount('/local/elsewise/singapore', DEFAULT_PROJECT_LAYOUT, { dhaka: 'missing' });

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveAccessibleDescription('Folder missing');
  });

  test('describes broken workspace', async () => {
    await mount('/local/elsewise/singapore', DEFAULT_PROJECT_LAYOUT, { singapore: 'broken' });

    await expect
      .element(page.getByRole('treeitem', { name: 'Singapore' }))
      .toHaveAccessibleDescription('Not a worktree Main workspace');
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

    await expect.element(page.getByRole('treeitem', { name: 'notes', exact: true })).toBeVisible();
  });
});
