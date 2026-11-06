import type { RepositorySource } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mount } from '../../../../test/projects';

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
});

const NOTES = { name: 'matthias/notes', url: 'https://github.com/matthias/notes.git' };
const TOOLS = { name: 'elsewise/tools', url: 'https://github.com/elsewise/tools.git' };

const GITHUB: RepositorySource = async () => [
  { id: 'github.matthias', order: 10, label: 'GitHub · matthias', items: [NOTES] },
  { id: 'github.elsewise', order: 20, label: 'GitHub · elsewise', items: [TOOLS] },
];

// Mounts the sidebar in the desktop app, where Add project shows, and opens the new project dialog.
async function open() {
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
  const mounted = await mount('/local/elsewise/singapore');
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('menuitem', { name: 'New project…' }).click();
  await expect.element(page.getByRole('heading', { name: 'New project' })).toBeVisible();
  return mounted;
}

// Pastes `url` into Repository and closes its list.
async function paste(url: string) {
  await page.getByRole('combobox', { name: 'Repository' }).fill(url);
  await userEvent.keyboard('{Escape}');
}

describe('NewProjectDialog', () => {
  test('creates empty project and opens it', async () => {
    const { router } = await open();

    await page.getByRole('textbox', { name: 'Name' }).fill('My App');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'My App', exact: true })).toBeVisible();
    expect(router.state.location.pathname).toBe('/local/my-app/main');
  });

  test('requires name without repository', async () => {
    await open();

    await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('clones pasted URL and opens it', async () => {
    const { router } = await open();

    await paste('https://github.com/matthias/notes.git');
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'notes');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'notes', exact: true })).toBeVisible();
    expect(router.state.location.pathname).toBe('/local/notes/main');
  });

  test('offers pasted URL in list', async () => {
    await open();

    await page.getByRole('combobox', { name: 'Repository' }).fill('git@github.com:matthias/notes.git');

    await expect
      .poll(() => document.querySelector('[data-slot="combobox-content"]')?.textContent)
      .toContain('Clone “git@github.com:matthias/notes.git”');
  });

  test('locks create for unpicked search', async () => {
    await open();

    await paste('notes');

    await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('lists groups from sources', async () => {
    const { projects } = await open();
    projects.addRepositorySources([GITHUB]);

    await page.getByRole('combobox', { name: 'Repository' }).click();

    await expect
      .poll(() => [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent))
      .toEqual(['matthias/notes', 'elsewise/tools']);
    expect(document.querySelector('[data-slot="combobox-content"]')?.textContent).toContain('GitHub · elsewise');
  });

  test('searches sources with typed query', async () => {
    const { projects } = await open();
    const source = vi.fn<RepositorySource>(async () => []);
    projects.addRepositorySources([source]);

    await page.getByRole('combobox', { name: 'Repository' }).fill('note');

    await expect.poll(() => source.mock.lastCall?.[0]).toBe('note');
  });

  test('clones picked repository', async () => {
    const { projects, router } = await open();
    projects.addRepositorySources([GITHUB]);

    await page.getByRole('combobox', { name: 'Repository' }).click();
    await page.getByRole('option', { name: 'matthias/notes' }).click();
    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('placeholder', 'notes');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('treeitem', { name: 'notes', exact: true })).toBeVisible();
    expect(router.state.location.pathname).toBe('/local/notes/main');
  });

  test('shows clone progress', async () => {
    const { projects } = await open();
    vi.spyOn(projects, 'clone').mockImplementation(async (_, __, options) => {
      options?.onProgress?.({ phase: 'receiving', percent: 42 });
      return new Promise(() => {});
    });

    await paste('https://github.com/matthias/notes.git');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('status')).toHaveTextContent('Receiving objects42%');
  });

  test('stops clone on cancel', async () => {
    const { projects } = await open();
    let signal: AbortSignal | undefined;
    vi.spyOn(projects, 'clone').mockImplementation(async (_, __, options) => {
      signal = options?.signal;
      return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('Aborted'))));
    });

    await paste('https://github.com/matthias/notes.git');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect.element(page.getByRole('status')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
  });

  test('shows sign-in failure', async () => {
    const { projects } = await open();
    vi.spyOn(projects, 'clone').mockRejectedValue(
      new TransportError(Code.FAILED_PRECONDITION, 'git found no credentials'),
    );

    await paste('https://github.com/matthias/notes.git');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not sign in to github.comgit found no credentials');
  });

  test('shows failure', async () => {
    const { projects } = await open();
    vi.spyOn(projects, 'add').mockRejectedValue(new Error('disk full'));

    await page.getByRole('textbox', { name: 'Name' }).fill('App');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('alert')).toHaveTextContent('Could not create the projectdisk full');
  });

  test('clears fields after closing', async () => {
    await open();

    await page.getByRole('textbox', { name: 'Name' }).fill('App');
    await paste('https://github.com/matthias/notes.git');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByRole('menuitem', { name: 'New project…' }).click();

    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    await expect.element(page.getByRole('combobox', { name: 'Repository' })).toHaveValue('');
  });
});
