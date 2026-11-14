import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { FILE_TREE_TERMS } from '@/routes/settings/local/file-tree';
import { settingsQuery } from '@/settings/settings';
import { HiddenRow } from './-hidden-row';

const DEFAULTS = DEFAULT_FRONTEND_SETTINGS.fileTree.hidden;

afterEach(() => {
  window.bridge = undefined;
});

// Renders the row with `hidden`. Returns the bridge's save.
async function mount(hidden: readonly string[] = DEFAULTS) {
  const settings = withHidden(hidden);
  const save = vi.fn(async () => {});
  window.bridge = {
    settings: {
      load: async () => settings,
      save,
      loadPlugin: async () => ({}),
      savePlugin: async () => {},
      loadUserThemes: async () => [],
      saveUserTheme: async () => {},
      deleteUserTheme: async () => {},
      loadUserKeymaps: async () => [],
      saveUserKeymap: async () => {},
      deleteUserKeymap: async () => {},
      onChange: () => {},
    },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  await render(
    <QueryClientProvider client={client}>
      <HiddenRow term={FILE_TREE_TERMS.hidden} />
    </QueryClientProvider>,
  );
  return save;
}

function withHidden(hidden: readonly string[]): FrontendSettings {
  return { ...DEFAULT_FRONTEND_SETTINGS, fileTree: { ...DEFAULT_FRONTEND_SETTINGS.fileTree, hidden: [...hidden] } };
}

function option(pattern: string) {
  return page.getByRole('option', { name: pattern, exact: true });
}

const field = () => page.getByRole('textbox', { name: 'Pattern', exact: true });

const adding = () => page.getByRole('textbox', { name: 'Add pattern' });

describe('HiddenRow', () => {
  test('adds pattern', async () => {
    const save = await mount();

    await userEvent.click(adding());
    await userEvent.keyboard('dist{Enter}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden([...DEFAULTS, 'dist']));
    await expect.element(adding()).toHaveValue('');
    await expect.element(adding()).toHaveFocus();
  });

  test('adds pattern on blur', async () => {
    const save = await mount();

    await userEvent.click(adding());
    await userEvent.keyboard('dist{Tab}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden([...DEFAULTS, 'dist']));
  });

  test('ignores empty new pattern', async () => {
    const save = await mount();

    await userEvent.click(adding());
    await userEvent.keyboard('  {Enter}');

    expect(save).not.toHaveBeenCalled();
  });

  test('clears new pattern on Escape', async () => {
    const save = await mount();

    await userEvent.click(adding());
    await userEvent.keyboard('dist{Escape}');

    await expect.element(adding()).toHaveValue('');
    await expect.element(adding()).not.toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  test('edits pattern in place', async () => {
    const save = await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('tmp/{Enter}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.with(1, 'tmp/')));
    await expect.element(option('tmp/')).toHaveFocus();
  });

  test('edits selected pattern on Enter', async () => {
    await mount();

    await userEvent.click(option('.hg'));
    await userEvent.keyboard('{Escape}');
    await expect.element(option('.hg')).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await expect.element(field()).toHaveValue('.hg');
  });

  test('saves open edit on clicking another pattern', async () => {
    const save = await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('tmp');
    await userEvent.click(option('.hg'));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.with(1, 'tmp')));
    await expect.element(field()).toHaveValue('.hg');
  });

  test('removes emptied pattern', async () => {
    const save = await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('{Backspace}{Enter}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.filter((pattern) => pattern !== '.svn')));
  });

  test('saves on blur', async () => {
    const save = await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('tmp{Tab}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.with(1, 'tmp')));
  });

  test('cancels on Escape', async () => {
    const save = await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('tmp{Escape}');

    await expect.element(option('.svn')).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  test('rejects duplicate', async () => {
    const save = await mount();

    await userEvent.click(adding());
    await userEvent.keyboard('.git{Enter}');

    await expect.element(adding()).toHaveAttribute('aria-invalid', 'true');
    await expect.element(adding()).toHaveAccessibleDescription('“.git” is already hidden.');
    expect(save).not.toHaveBeenCalled();

    await userEvent.keyboard('{Backspace}');

    await expect.element(adding()).not.toHaveAttribute('aria-invalid');
  });

  test('removes pattern by button', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('button', { name: 'Remove .hg' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.filter((pattern) => pattern !== '.hg')));
  });

  test('removes selected pattern by Mod-Backspace', async () => {
    const save = await mount();

    await userEvent.click(option('.hg'));
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Meta>}{Backspace}{/Meta}');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS.filter((pattern) => pattern !== '.hg')));
    await expect.element(option('.DS_Store')).toHaveFocus();
  });

  test('moves selection by arrow keys', async () => {
    await mount();

    await userEvent.click(option('.svn'));
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(option('.hg')).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{End}');
    await expect.element(option('Thumbs.db')).toHaveFocus();

    await userEvent.keyboard('{Home}');
    await expect.element(option('.git')).toHaveFocus();
  });

  test('resets to defaults', async () => {
    const save = await mount(['dist']);

    await userEvent.click(page.getByRole('button', { name: 'Reset Hidden files' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withHidden(DEFAULTS));
  });

  test('offers Reset only when changed', async () => {
    await mount();

    await expect.element(page.getByRole('button', { name: 'Reset Hidden files' })).not.toBeInTheDocument();
  });

  test('shows only add field when empty', async () => {
    await mount([]);

    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
    await expect.element(adding()).toBeVisible();
  });
});
