import { Code, TransportError } from '@elsewise/transport';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount, sampleDialogs } from '../../../../test/projects';

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
});

describe('ImportWorkspaceDialog', () => {
  test('imports worktree and opens it', async () => {
    const { router, created } = await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect
      .element(page.getByRole('textbox', { name: 'Name' }))
      .toHaveAttribute('placeholder', 'dotfiles-detached');
    await page.getByRole('button', { name: 'Import' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'Lisbon' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/local/dotfiles/lisbon');
    expect(created).toEqual([
      { projectId: 'dotfiles', source: { case: 'existing', value: { name: '', absolutePath: '/dotfiles-detached' } } },
    ]);
  });

  test('links empty import to new workspace', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'elsewise', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect.element(page.getByRole('combobox', { name: 'Worktree' })).toBeDisabled();
    await expect
      .poll(() => page.getByRole('dialog').element().textContent)
      .toContain('No worktrees to import · New workspace');
    await expect.element(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    await page.getByRole('button', { name: 'New workspace' }).click();

    await expect.element(page.getByRole('heading', { name: 'New workspace in “elsewise”' })).toBeInTheDocument();
  });

  test('shows taken name in import dialog', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    vi.spyOn(projects.workspaces, 'add').mockRejectedValue(
      new TransportError(Code.ALREADY_EXISTS, 'a project or workspace is already at the path'),
    );

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect
      .poll(() => page.getByRole('combobox', { name: 'Worktree' }).element().textContent)
      .toMatch(/^dotfiles-detached/);
    await page.getByRole('button', { name: 'Import' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('A workspace named “dotfiles-detached” already exists.');
  });

  test('lists worktrees without workspace', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await page.getByRole('combobox', { name: 'Worktree' }).click();

    await expect
      .poll(() =>
        page
          .getByRole('option')
          .elements()
          .map((option) => [...(option.firstElementChild?.children ?? [])].map((part) => part.textContent)),
      )
      .toEqual([
        ['dotfiles-detached', 'detached'],
        ['dotfiles-feat-y', 'feat-y'],
        ['dotfiles-spike', 'spike'],
      ]);
  });

  test('imports picked worktree with name', async () => {
    const { created } = await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await page.getByRole('combobox', { name: 'Worktree' }).click();
    await page.getByRole('option', { name: /^dotfiles-spike/ }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Spike');
    await page.getByRole('button', { name: 'Import' }).click();

    await expect
      .poll(() => created)
      .toEqual([
        {
          projectId: 'dotfiles',
          source: { case: 'existing', value: { name: 'Spike', absolutePath: '/dotfiles-spike' } },
        },
      ]);
  });

  test('shows failure in import dialog', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    vi.spyOn(projects.workspaces, 'add').mockRejectedValue(new Error('git exited with code 128'));

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect
      .poll(() => page.getByRole('combobox', { name: 'Worktree' }).element().textContent)
      .toMatch(/^dotfiles-detached/);
    await page.getByRole('button', { name: 'Import' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not import the workspacegit exited with code 128');
  });

  test('locks import dialog while importing', async () => {
    const { projects } = await mount('/local/elsewise/singapore');
    let fail = (_: Error) => {};
    vi.spyOn(projects.workspaces, 'add').mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect
      .poll(() => page.getByRole('combobox', { name: 'Worktree' }).element().textContent)
      .toMatch(/^dotfiles-detached/);
    await page.getByRole('button', { name: 'Import' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    fail(new Error('Gone'));
    await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toBeEnabled();
  });

  test('clears import fields after closing', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await page.getByRole('combobox', { name: 'Worktree' }).click();
    await page.getByRole('option', { name: /^dotfiles-spike/ }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Spike');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('treeitem', { name: 'dotfiles', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();

    await expect
      .poll(() => page.getByRole('combobox', { name: 'Worktree' }).element().textContent)
      .toMatch(/^dotfiles-detached/);
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  test('switches to new without flash', async () => {
    await mount('/local/elsewise/singapore');
    await userEvent.click(page.getByRole('treeitem', { name: 'elsewise', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
    await expect
      .poll(() => page.getByRole('dialog').element().textContent)
      .toContain('No worktrees to import · New workspace');

    const frames = await sampleDialogs(() => page.getByRole('button', { name: 'New workspace' }).click());

    expect(new Set(frames.map((frame) => frame.backdrops.join()))).toEqual(new Set(['1']));
    expect(new Set(frames.map((frame) => frame.popups.join()))).toEqual(new Set(['1']));
    await expect.element(page.getByRole('heading', { name: 'New workspace in “elsewise”' })).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  test('keeps focus in dialog with disabled worktree', async () => {
    await mount('/local/elsewise/singapore');

    await userEvent.click(page.getByRole('treeitem', { name: 'elsewise', exact: true }), { button: 'right' });
    await page.getByRole('menuitem', { name: /^Import workspace/ }).click();

    await expect.element(page.getByRole('combobox', { name: 'Worktree' })).toBeDisabled();
    await expect.poll(() => page.getByRole('dialog').element().contains(document.activeElement)).toBe(true);
  });
});
