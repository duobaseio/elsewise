import { Code, TransportError } from '@elsewise/transport';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount, sampleDialogs } from '../../../../test/projects';

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
});

describe('NewWorkspaceDialog', () => {
  test('adds workspace and opens it', async () => {
    const { router, created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(created).toEqual([
      { projectId: 'dotfiles', source: { case: 'new', value: { name: 'otter', branch: '', base: '' } } },
    ]);
  });

  test('shows generated name', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
  });

  test('generates name again after creating', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'heron');
  });

  test('sends name, branch and base', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Fix login');
    await page.getByRole('combobox', { name: 'Branch' }).fill('fix-login');
    await userEvent.keyboard('{Escape}');
    await page.getByRole('combobox', { name: 'Base' }).click();
    await page.getByRole('option', { name: 'v1.0' }).click();
    await page.getByRole('button', { name: 'Create' }).click();

    await expect
      .poll(() => created)
      .toEqual([
        {
          projectId: 'dotfiles',
          source: { case: 'new', value: { name: 'Fix login', branch: 'fix-login', base: 'v1.0' } },
        },
      ]);
  });

  test('sections bases by remote and tag', async () => {
    await mount('/local/elsewise/singapore');
    const sections = () =>
      page
        .getByRole('group')
        .elements()
        .map((group) => [...group.querySelectorAll('[role="option"]')].map((option) => option.textContent));

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Base' }).click();

    await expect.poll(sections).toEqual([['feat-x', 'feat-y', 'main'], ['feat-z', 'main'], ['v1.0']]);
    await expect.element(page.getByRole('group', { name: 'origin' })).toBeInTheDocument();
    await expect.element(page.getByRole('group', { name: 'Tags' })).toBeInTheDocument();
    await page.getByPlaceholder('Search').fill('origin');
    await expect.poll(sections).toEqual([['feat-z', 'main']]);
    expect(document.querySelectorAll('[data-slot="combobox-separator"]')).toHaveLength(0);
  });

  test('starts from main worktree branch', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('combobox', { name: 'Base' })).toHaveTextContent('main');
  });

  test('uses existing branch without base', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: 'feat-x' }).click();

    await expect.element(page.getByRole('combobox', { name: 'Base' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect
      .poll(() => created)
      .toEqual([
        { projectId: 'dotfiles', source: { case: 'new', value: { name: 'otter', branch: 'feat-x', base: '' } } },
      ]);
  });

  test('tracks remote-only branch', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-z');
    await page.getByRole('option', { name: /^feat-z/ }).click();

    await expect.element(page.getByRole('combobox', { name: 'Base' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect
      .poll(() => created)
      .toEqual([
        {
          projectId: 'dotfiles',
          source: { case: 'new', value: { name: 'otter', branch: 'feat-z', base: 'origin/feat-z' } },
        },
      ]);
  });

  test('sections branches by remote', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).click();

    await expect
      .poll(() =>
        page
          .getByRole('group')
          .elements()
          .map((group) => [...group.querySelectorAll('[role="option"]')].map((option) => option.textContent)),
      )
      .toEqual([['feat-x'], ['feat-z']]);
    await expect.element(page.getByRole('group', { name: 'origin' })).toBeInTheDocument();
  });

  test('hints at typing new branch', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).click();

    await expect.element(page.getByText('Type a new branch')).toBeInTheDocument();
  });

  test('keeps typed branch on Escape', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('fix-login');
    await expect.element(page.getByText('New branch “fix-login”')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByText('New branch “fix-login”')).not.toBeInTheDocument();
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    await expect.element(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('fix-login');
  });

  test.each(['fix-login', 'feat'])('keeps typed branch %s on Enter', async (typed) => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill(typed);
    await expect.element(page.getByText(`New branch “${typed}”`)).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByText(`New branch “${typed}”`)).not.toBeInTheDocument();
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    await expect.element(page.getByRole('combobox', { name: 'Branch' })).toHaveValue(typed);
    expect(created).toEqual([]);
  });

  test('creates typed branch on second Enter', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat');
    await expect.element(page.getByText('New branch “feat”')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByText('New branch “feat”')).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    await expect
      .poll(() => created)
      .toEqual([
        { projectId: 'dotfiles', source: { case: 'new', value: { name: 'otter', branch: 'feat', base: '' } } },
      ]);
  });

  test('picks highlighted branch on Enter', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat');
    await expect.element(page.getByText('New branch “feat”')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect.element(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('feat-x');
    await expect.element(page.getByRole('option')).not.toBeInTheDocument();
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  test('hides branch checked out in workspace', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('main');

    await expect.element(page.getByText('Already in Tokyo')).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(page.getByRole('option').elements()).toEqual([]);
  });

  test('hides branch checked out in worktree', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-y');

    await expect
      .poll(() => page.getByRole('dialog').element().textContent)
      .toContain('Already in a worktree · Import workspace');
    await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(page.getByRole('option').elements()).toEqual([]);
  });

  test('links branch in worktree to import', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Experiment');
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-y');
    await userEvent.keyboard('{Escape}');
    await page.getByRole('button', { name: 'Import workspace' }).click();

    await expect.element(page.getByRole('heading', { name: 'Import workspace into “dotfiles”' })).toBeInTheDocument();
    await expect
      .poll(() => page.getByRole('combobox', { name: 'Worktree' }).element().textContent)
      .toMatch(/^dotfiles-feat-y/);
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Experiment');
  });

  test('clears fields after closing', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Fix login');
    await page.getByRole('combobox', { name: 'Branch' }).fill('fix-login');
    await userEvent.keyboard('{Escape}');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();

    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    await expect.element(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('');
  });

  test('shows taken name in dialog', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    vi.spyOn(projects.workspaces, 'add').mockRejectedValue(
      new TransportError(Code.ALREADY_EXISTS, 'a project or workspace is already at the path'),
    );

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('feat');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('alert')).toHaveTextContent('A workspace named “feat” already exists.');
  });

  test('shows failure in dialog', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    vi.spyOn(projects.workspaces, 'add').mockRejectedValue(new Error('git exited with code 128'));

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('feat');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not create the workspacegit exited with code 128');
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('feat');
    await expect.element(page.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  test('locks new workspace dialog while creating', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    let fail = (_: Error) => {};
    const add = vi.spyOn(projects.workspaces, 'add').mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('button', { name: 'Create' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await userEvent.type(page.getByRole('textbox', { name: 'Name' }), 'x{Enter}');
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(add).toHaveBeenCalledOnce();
    fail(new Error('Gone'));
    await expect.element(page.getByRole('button', { name: 'Create' })).not.toHaveAttribute('aria-busy');
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
  });

  test('clears branch with button', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-x');
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('combobox', { name: 'Base' })).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Clear branch' }).click();

    await expect.element(page.getByRole('combobox', { name: 'Branch' })).toHaveValue('');
    await expect.element(page.getByRole('combobox', { name: 'Base' })).toHaveTextContent('main');
  });

  test('closes empty branch list', async () => {
    await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('main');

    await expect.poll(() => page.getByRole('dialog').element().textContent).toContain('Already in Tokyo');
    await expect.poll(() => document.querySelector('[data-slot="combobox-content"]')).toBeNull();
  });

  test('drops base for existing branch', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Base' }).click();
    await page.getByRole('option', { name: 'v1.0' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: 'feat-x' }).click();
    await page.getByRole('button', { name: 'Create' }).click();

    await expect
      .poll(() => created)
      .toEqual([
        { projectId: 'dotfiles', source: { case: 'new', value: { name: 'otter', branch: 'feat-x', base: '' } } },
      ]);
  });

  test('switches to import without flash', async () => {
    await mount('/local/elsewise/singapore');
    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-y');
    await userEvent.keyboard('{Escape}');

    const frames = await sampleDialogs(() => page.getByRole('button', { name: 'Import workspace' }).click());

    expect(new Set(frames.map((frame) => frame.backdrops.join()))).toEqual(new Set(['1']));
    expect(new Set(frames.map((frame) => frame.popups.join()))).toEqual(new Set(['1']));
    await expect.element(page.getByRole('heading', { name: 'Import workspace into “dotfiles”' })).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  test('returns focus to opener after switched dialog closes', async () => {
    await mount('/local/elsewise/singapore');
    await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
    await page.getByRole('combobox', { name: 'Branch' }).fill('feat-y');
    await userEvent.keyboard('{Escape}');
    await page.getByRole('button', { name: 'Import workspace' }).click();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(page.getByRole('treeitem', { name: 'New workspace in dotfiles' })).toHaveFocus();
  });
});
