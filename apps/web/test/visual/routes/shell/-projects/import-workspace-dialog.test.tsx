import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../../../../projects';

import { THEMES } from '../../../../sheet';

// Opens the import workspace dialog of `project` on a page as small as the dialog and its list need.
async function open(theme: 'light' | 'dark', project: string) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 720);
  const mounted = await mount('/local/elsewise/singapore');
  await userEvent.click(page.getByRole('treeitem', { name: project, exact: true }), { button: 'right' });
  await page.getByRole('menuitem', { name: /^Import workspace/ }).click();
  await expect.element(page.getByRole('heading', { name: `Import workspace into “${project}”` })).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog and its list.
  const sheet = page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
  return { ...mounted, sheet };
}

test.each(THEMES)('import workspace dialog (%s)', async (theme) => {
  const { sheet } = await open(theme, 'dotfiles');
  await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'dotfiles-detached');

  await expect(sheet).toMatchScreenshot(`import-workspace-dialog-${theme}`);
});

test.each(THEMES)('import workspace dialog worktree list (%s)', async (theme) => {
  const { sheet } = await open(theme, 'dotfiles');
  await page.getByRole('combobox', { name: 'Worktree' }).click();
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(3);

  await expect(sheet).toMatchScreenshot(`import-workspace-dialog-worktree-list-${theme}`);
});

test.each(THEMES)('import workspace dialog without worktrees (%s)', async (theme) => {
  const { sheet } = await open(theme, 'elsewise');
  await expect.element(page.getByRole('button', { name: 'New workspace' })).toBeVisible();

  await expect(sheet).toMatchScreenshot(`import-workspace-dialog-empty-${theme}`);
});

test.each(THEMES)('import workspace dialog failure (%s)', async (theme) => {
  const { projects, sheet } = await open(theme, 'dotfiles');
  vi.spyOn(projects.workspaces, 'add').mockRejectedValue(new Error('git exited with code 128'));
  await expect.element(page.getByRole('textbox', { name: 'Name' })).toBeEnabled();
  page.getByRole('textbox', { name: 'Name' }).element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`import-workspace-dialog-failure-${theme}`);
});
