import { DEFAULT_PROJECT_LAYOUT } from '@elsewise/bridge';
import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_COMMAND_GROUPS, type ProjectCommand, type WorkspaceCommand } from '@elsewise/frontend-plugin';
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FILE_MANAGER } from '@/projects/commands';
import { mount } from '../../../../test/projects';

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
});

function pickFolder(absolutePath: string | null) {
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      showPath: async () => {},
      pickPaths: async () => (absolutePath === null ? [] : [absolutePath]),
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
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

    await expect.poll(names).toEqual(['dotfiles', 'Tokyo', 'Hanoi', 'elsewise', 'Dhaka', 'Singapore']);
  });

  test('moves dragged project', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo', 'Hanoi']);

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'dotfiles', exact: true }),
      page.getByRole('treeitem', { name: 'elsewise', exact: true }),
    );

    await expect.poll(names).toEqual(['dotfiles', 'Tokyo', 'Hanoi', 'elsewise', 'Singapore', 'Dhaka']);
    expect(saved.at(-1)?.daemons.local?.projects.map(({ id }) => id)).toEqual(['dotfiles', 'elsewise']);
  });

  test('moves dragged workspace', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo', 'Hanoi']);

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'Dhaka' }),
      page.getByRole('treeitem', { name: 'Singapore' }),
    );

    await expect.poll(names).toEqual(['elsewise', 'Dhaka', 'Singapore', 'dotfiles', 'Tokyo', 'Hanoi']);
    expect(saved.at(-1)?.daemons.local?.projects.find(({ id }) => id === 'elsewise')?.workspaces).toEqual([
      'dhaka',
      'singapore',
    ]);
  });

  test('keeps workspace within project', async () => {
    const { saved } = await mount('/local/elsewise/singapore');
    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo', 'Hanoi']);

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'Dhaka' }),
      page.getByRole('treeitem', { name: 'Tokyo' }),
    );

    await expect.poll(names).toEqual(['elsewise', 'Singapore', 'Dhaka', 'dotfiles', 'Tokyo', 'Hanoi']);
    expect(saved).toEqual([]);
  });

  test('opens workspace', async () => {
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'Tokyo' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Tokyo' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/tokyo');
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
    await page.getByRole('button', { name: 'Create' }).click();

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
    await expect.element(page.getByRole('button', { name: 'Add project' })).toHaveFocus();
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

  test('ignores keys from workspace item', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.workspaces.addSidebarItems([
      { id: 'test.a', component: ({ workspace }) => <button type="button">{`A ${workspace.name}`}</button> },
    ]);
    (await page.getByRole('button', { name: 'A Dhaka' }).findElement()).focus();

    await userEvent.keyboard('{Backspace}');

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  test('ignores keys from project item', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.addSidebarItems([
      { id: 'test.a', component: ({ project }) => <button type="button">{`A ${project.name}`}</button> },
    ]);
    (await page.getByRole('button', { name: 'A dotfiles' }).findElement()).focus();

    await userEvent.keyboard('{Delete}');

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
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
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
  });

  test('resets complete status from context menu', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.workspaces.addStatus({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' }, 'complete');

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Mark as read/ }).click();

    expect(projects.workspaces.status({ daemon: 'local', project: 'elsewise', workspace: 'dhaka' })).toBe('idle');
  });

  test('hides Mark as read unless complete', async () => {
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

  test('renames workspace on Enter', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Shift>}{F6}{/Shift}');
    await userEvent.fill(page.getByRole('textbox', { name: 'Workspace name' }), 'Hue');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'Hue' })).toHaveFocus();
  });

  test('refocuses workspace after Escape', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Shift>}{F6}{/Shift}');
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveFocus();
  });

  test('keeps name of blank rename', async () => {
    await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Shift>}{F6}{/Shift}');
    await userEvent.fill(page.getByRole('textbox', { name: 'Workspace name' }), ' ');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toBeInTheDocument();
  });

  test('keeps Backspace in rename field', async () => {
    const { deleted } = await mount('/local/elsewise/singapore');
    page.getByRole('treeitem', { name: 'Dhaka' }).element().focus();

    await userEvent.keyboard('{Shift>}{F6}{/Shift}');
    await userEvent.keyboard('{Backspace}');

    await expect.element(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue('');
    expect(page.getByRole('dialog').query()).toBeNull();
    expect(deleted).toEqual([]);
  });

  test('renames project from context menu', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Rename…/ }).click();
    await userEvent.fill(page.getByRole('textbox', { name: 'Project name' }), 'config');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'config', exact: true })).toBeInTheDocument();
  });

  test('renames workspace from context menu after dialog', async () => {
    await mount('/local/elsewise/singapore');
    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Rename…/ }).click();
    await userEvent.fill(page.getByRole('textbox', { name: 'Workspace name' }), 'Hue');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'Hue' })).toBeInTheDocument();
  });

  test('renames project from context menu after dialog', async () => {
    await mount('/local/elsewise/singapore');
    await page.getByRole('button', { name: 'Delete Dhaka' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Rename…/ }).click();
    await userEvent.fill(page.getByRole('textbox', { name: 'Project name' }), 'config');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'config', exact: true })).toBeInTheDocument();
  });

  test('refocuses row after dismissing context menu', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await expect.element(page.getByRole('menu')).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'Dhaka' })).toHaveFocus();
  });

  test('lists workspace commands in new workspace menu', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'New workspace in dotfiles' }), { button: 'right' });

    await expect
      .poll(() =>
        page
          .getByRole('menuitem')
          .elements()
          .map((item) => item.textContent),
      )
      .toEqual(['New workspace…', 'Import workspace…']);
  });

  test('imports workspace from new workspace menu', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'New workspace in dotfiles' }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();

    await expect.element(page.getByRole('heading', { name: 'Import workspace into “dotfiles”' })).toBeInTheDocument();
  });

  test('highlights new workspace row while menu open', async () => {
    await mount('/local/elsewise/singapore');
    const row = page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).element();

    await userEvent.click(row, { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).hover();

    expect(getComputedStyle(row).backgroundImage).not.toBe('none');
  });

  test('refocuses new workspace row after dismissing menu', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'New workspace in dotfiles' }), { button: 'right' });
    await expect.element(page.getByRole('menu')).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'New workspace in dotfiles' })).toHaveFocus();
  });

  test('opens workspace in file manager', async () => {
    await mount('/local/elsewise/singapore');
    const showPath = vi.fn(async () => {});
    window.bridge = {
      window: {
        cut() {},
        copy() {},
        paste() {},
        showPath,
        pickPaths: async () => [],
        setBrightness() {},
        setBackground() {},
        onClose() {},
      },
    };

    await userEvent.click(page.getByRole('treeitem', { name: 'Dhaka' }), { button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in' }).click();
    await page.getByRole('menuitem', { name: FILE_MANAGER }).click();

    await expect.poll(() => showPath.mock.lastCall).toEqual(['/elsewise/dhaka']);
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

  test('lists built-in sources', async () => {
    pickFolder(null);
    await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Import project…' })).toBeVisible();
    expect(
      page
        .getByRole('menuitem')
        .elements()
        .map((element) => element.textContent),
    ).toEqual(['New project…', 'Import project…']);
  });

  test('hides import without folder picker', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'New project…' })).toBeVisible();
    expect(page.getByRole('menuitem', { name: 'Import project…' }).query()).toBeNull();
  });

  test('separates source groups', async () => {
    pickFolder(null);
    const { projects } = await mount('/local/elsewise/singapore');
    projects.addSources([
      { id: 'test', order: 20, sources: [{ id: 'test.clone', label: 'Clone…', add: async () => null }] },
      {
        id: 'test.hidden',
        order: 30,
        sources: [{ id: 'test.hidden', label: 'Hidden', shown: () => false, add: async () => null }],
      },
    ]);

    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).toBeVisible();
    expect(
      [...document.querySelectorAll('[role="menuitem"], [role="separator"]')].map(
        (element) => element.textContent || element.getAttribute('role'),
      ),
    ).toEqual(['New project…', 'Import project…', 'separator', 'Clone…']);
  });

  test('disables source', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    projects.addSources([
      { id: 'test', sources: [{ id: 'test.clone', label: 'Clone…', enabled: () => false, add: async () => null }] },
    ]);

    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('disables source while it adds', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    const { promise, resolve } = Promise.withResolvers<null>();
    projects.addSources([{ id: 'test', sources: [{ id: 'test.clone', label: 'Clone…', add: () => promise }] }]);

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Clone…' }).click();
    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).toHaveAttribute('aria-disabled', 'true');

    resolve(null);

    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).not.toHaveAttribute('aria-disabled');
  });

  test('disables each source while it adds', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    const clone = Promise.withResolvers<null>();
    const template = Promise.withResolvers<null>();
    projects.addSources([
      {
        id: 'test',
        sources: [
          { id: 'test.clone', label: 'Clone…', add: () => clone.promise },
          { id: 'test.template', label: 'Template…', add: () => template.promise },
        ],
      },
    ]);

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Clone…' }).click();
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Template…' }).click();
    template.resolve(null);
    await page.getByRole('button', { name: 'Add project' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Template…' })).not.toHaveAttribute('aria-disabled');
    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).toHaveAttribute('aria-disabled', 'true');

    clone.resolve(null);

    await expect.element(page.getByRole('menuitem', { name: 'Clone…' })).not.toHaveAttribute('aria-disabled');
  });

  test('logs rejecting source', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { projects } = await mount('/local/elsewise/singapore');
    projects.addSources([
      {
        id: 'test',
        sources: [
          { id: 'test.clone', label: 'Clone…', add: () => Promise.reject(new Error('authentication required')) },
        ],
      },
    ]);
    const added = vi.spyOn(toast, 'add');

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Clone…' }).click();

    await expect
      .poll(() => error.mock.lastCall)
      .toEqual(['Project source test.clone failed', new Error('authentication required')]);
    expect(added).not.toHaveBeenCalled();
  });

  test('imports picked folder and opens it', async () => {
    pickFolder('/Users/me/notes');
    const { router } = await mount('/local/elsewise/singapore');

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Import project…' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'notes', exact: true })).toBeVisible();
    await expect.poll(() => router.state.location.pathname).toBe('/local/notes/main');
  });

  test('ignores cancelled folder picker', async () => {
    pickFolder(null);
    const { projects } = await mount('/local/elsewise/singapore');
    const add = vi.spyOn(projects, 'add');

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Import project…' }).click();

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  test('shows import failure', async () => {
    pickFolder('/Users/me/downloads');
    const { projects } = await mount('/local/elsewise/singapore');
    vi.spyOn(projects, 'add').mockRejectedValue(new Error("the folder is not a repository's main working tree"));
    const added = vi.spyOn(toast, 'add');

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'Import project…' }).click();

    await expect
      .poll(() => added.mock.lastCall?.[0])
      .toMatchObject({
        type: 'error',
        title: 'Could not import “downloads”',
        description: "the folder is not a repository's main working tree",
      });
  });
});
