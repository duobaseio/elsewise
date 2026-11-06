import type { RepositorySource } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../../../../projects';

import { THEMES } from '../../../../sheet';

function Mark() {
  return (
    <svg aria-hidden="true" fill="currentColor" height={14} viewBox="0 0 16 16" width={14}>
      <circle cx={8} cy={8} r={7} />
    </svg>
  );
}

const GITHUB: RepositorySource = async () => [
  {
    id: 'github.matthias',
    order: 10,
    icon: Mark,
    label: 'GitHub · matthias',
    items: [
      { name: 'matthias/notes', url: 'https://github.com/matthias/notes.git', icon: Mark },
      { name: 'matthias/dotfiles', url: 'https://github.com/matthias/dotfiles.git', icon: Mark },
    ],
  },
  {
    id: 'github.elsewise',
    order: 20,
    icon: Mark,
    label: 'GitHub · elsewise',
    items: [{ name: 'elsewise/tools', url: 'https://github.com/elsewise/tools.git', icon: Mark }],
  },
];

// Opens the new project dialog on a page as small as the dialog and its list need, with GitHub's repositories listed.
async function open(theme: 'light' | 'dark') {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      openFolder: async () => {},
      pickFolder: async () => null,
      pickFile: async () => null,
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
  onTestFinished(() => {
    window.bridge = undefined;
  });
  await page.viewport(560, 720);
  const mounted = await mount('/local/elsewise/singapore');
  mounted.projects.addRepositorySources([GITHUB]);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('menuitem', { name: 'New project…' }).click();
  await expect.element(page.getByRole('heading', { name: 'New project' })).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog and its list.
  const sheet = page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
  return { ...mounted, sheet };
}

// Pastes `url` into Repository and closes its list with the keyboard, so no hover is captured.
async function paste(url: string) {
  await page.getByRole('combobox', { name: 'Repository' }).fill(url);
  await userEvent.keyboard('{Escape}');
}

test.each(THEMES)('new project dialog (%s)', async (theme) => {
  const { sheet } = await open(theme);

  await expect(sheet).toMatchScreenshot(`new-project-dialog-${theme}`);
});

test.each(THEMES)('new project dialog repository list (%s)', async (theme) => {
  const { sheet } = await open(theme);
  page.getByRole('combobox', { name: 'Repository' }).element().focus();
  await userEvent.keyboard('{ArrowDown}');
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(3);

  await expect(sheet).toMatchScreenshot(`new-project-dialog-repository-list-${theme}`);
});

test.each(THEMES)('new project dialog pasted URL (%s)', async (theme) => {
  const { sheet } = await open(theme);
  page.getByRole('combobox', { name: 'Repository' }).element().focus();
  await userEvent.keyboard('https://gitlab.com/someone/thing.git');
  await expect
    .poll(() => document.querySelector('[data-slot="combobox-content"]')?.textContent)
    .toContain('Clone “https://gitlab.com/someone/thing.git”');

  await expect(sheet).toMatchScreenshot(`new-project-dialog-url-${theme}`);
});

test.each(THEMES)('new project dialog picked repository (%s)', async (theme) => {
  const { sheet } = await open(theme);
  page.getByRole('combobox', { name: 'Repository' }).element().focus();
  await userEvent.keyboard('{ArrowDown}');
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBe(3);
  await userEvent.keyboard('{ArrowDown}{Enter}');
  await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'notes');

  await expect(sheet).toMatchScreenshot(`new-project-dialog-picked-${theme}`);
});

test.each(THEMES)('new project dialog cloning (%s)', async (theme) => {
  const { projects, sheet } = await open(theme);
  vi.spyOn(projects, 'clone').mockImplementation(async (_, __, options) => {
    options?.onProgress?.({ phase: 'receiving', percent: 42 });
    return new Promise(() => {});
  });
  await paste('https://github.com/matthias/notes.git');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('status')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-project-dialog-cloning-${theme}`);
});

test.each(THEMES)('new project dialog sign-in failure (%s)', async (theme) => {
  const { projects, sheet } = await open(theme);
  vi.spyOn(projects, 'clone').mockRejectedValue(
    new TransportError(Code.FAILED_PRECONDITION, 'git found no credentials for github.com'),
  );
  await paste('https://github.com/matthias/notes.git');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-project-dialog-sign-in-${theme}`);
});
