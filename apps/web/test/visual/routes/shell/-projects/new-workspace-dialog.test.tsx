import { Code, TransportError } from '@elsewise/transport';
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../../../../projects';

import { THEMES } from '../../../../sheet';

// Opens the new workspace dialog of dotfiles on a page as small as the dialog and its lists need.
async function open(theme: 'light' | 'dark') {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 720);
  const mounted = await mount('/local/elsewise/singapore');
  await page.getByRole('treeitem', { name: 'New workspace in dotfiles' }).click();
  await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'otter');
  await expect.element(page.getByRole('combobox', { name: 'Base' })).toHaveTextContent('main');
  // The backdrop covers the page, so its shot holds the dialog and its lists.
  const sheet = page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
  return { ...mounted, sheet };
}

test.each(THEMES)('new workspace dialog (%s)', async (theme) => {
  const { sheet } = await open(theme);

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-${theme}`);
});

test.each(THEMES)('new workspace dialog branch list (%s)', async (theme) => {
  const { sheet } = await open(theme);
  await page.getByRole('combobox', { name: 'Branch' }).click();
  await expect.element(page.getByText('Type a new branch')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-branch-list-${theme}`);
});

test.each(THEMES)('new workspace dialog new branch (%s)', async (theme) => {
  const { sheet } = await open(theme);
  await page.getByRole('combobox', { name: 'Branch' }).fill('f');
  await expect.element(page.getByText('New branch “f”')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-new-branch-${theme}`);
});

test.each(THEMES)('new workspace dialog base list (%s)', async (theme) => {
  const { sheet } = await open(theme);
  await page.getByRole('combobox', { name: 'Base' }).click();
  await expect.element(page.getByRole('group', { name: 'Tags' })).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-base-list-${theme}`);
});

test.each(THEMES)('new workspace dialog branch in worktree (%s)', async (theme) => {
  const { sheet } = await open(theme);
  await page.getByRole('combobox', { name: 'Branch' }).fill('feat-y');
  await userEvent.keyboard('{Escape}');
  await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-in-worktree-${theme}`);
});

test.each(THEMES)('new workspace dialog taken name (%s)', async (theme) => {
  const { projects, sheet } = await open(theme);
  vi.spyOn(projects.workspaces, 'add').mockRejectedValue(
    new TransportError(Code.ALREADY_EXISTS, 'a project or workspace is already at the path'),
  );
  await page.getByRole('textbox', { name: 'Name' }).fill('feat');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-taken-name-${theme}`);
});

test.each(THEMES)('new workspace dialog failure (%s)', async (theme) => {
  const { projects, sheet } = await open(theme);
  vi.spyOn(projects.workspaces, 'add').mockRejectedValue(new Error('git exited with code 128'));
  await page.getByRole('textbox', { name: 'Name' }).fill('feat');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-workspace-dialog-failure-${theme}`);
});
