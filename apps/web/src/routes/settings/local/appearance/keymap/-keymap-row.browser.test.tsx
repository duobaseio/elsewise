import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import {
  DEFAULT_FRONTEND_SETTINGS,
  type FrontendSettings,
  type Keymap,
  type KeymapId,
} from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { userKeymapsQuery } from '@/command/keymap/keymap';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { KeymapActions, KeymapSelect } from '@/routes/settings/local/appearance/keymap/-keymap-row';
import { settingsQuery } from '@/settings/settings';
import { pluginStore } from '../../../../../../test/plugins';

afterEach(() => {
  window.bridge = undefined;
});

describe('KeymapSelect', () => {
  const ELSEWISE: KeymapId = { source: 'elsewise', id: 'elsewise' };

  const MINE: KeymapId = { source: 'user', id: 'vim' };

  const MISSING: KeymapId = { source: 'plugin', plugin: 'io.missing', id: 'emacs' };

  const VIM = { name: 'Vim', keys: {} };

  // A plugin with a keymap named like the user's.
  const PLUGIN: InstalledFrontendPlugin = {
    manifest: {
      id: 'io.example',
      name: 'Example',
      version: '1.0.0',
      elsewise: '^1.0.0',
      frontend: { main: 'main.js' },
    },
    enabled: true,
    themes: [],
    keymaps: [{ id: 'vim', keymap: VIM }],
    url: '',
  };

  // Renders a select showing `keymap`, with `PLUGIN` installed and a user keymap when `others`. Returns its onChange.
  async function mount(keymap: KeymapId, others = false) {
    const onChange = vi.fn();
    const client = new QueryClient();
    client.setQueryData(userKeymapsQuery.queryKey, others ? [{ id: 'vim', keymap: VIM }] : []);
    const store = await pluginStore(others ? [PLUGIN] : []);
    await render(
      <QueryClientProvider client={client}>
        <PluginStoreContext value={store}>
          <KeymapSelect label="Keymap" keymap={keymap} onChange={onChange} />
        </PluginStoreContext>
      </QueryClientProvider>,
    );
    return onChange;
  }

  function shown() {
    return document.querySelector('[aria-label="Keymap"] [data-slot="combobox-value"]')?.textContent;
  }

  test('shows keymap', async () => {
    await mount(MINE, true);

    await expect.poll(shown).toBe('Vim');
  });

  test('shows Elsewise for missing keymap', async () => {
    await mount(MISSING);

    await expect.poll(shown).toBe('Elsewise');
  });

  test('returns picked keymap', async () => {
    const onChange = await mount(MINE, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));
    await userEvent.click(page.getByRole('option', { name: 'Elsewise' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(ELSEWISE);
  });

  test('labels plugin group', async () => {
    await mount(ELSEWISE, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));

    await expect
      .element(page.getByRole('group', { name: 'Example' }).getByRole('option', { name: 'Vim' }))
      .toBeVisible();
    expect(page.getByRole('group', { name: 'Example' }).getByRole('option').elements()).toHaveLength(1);
  });

  test('returns picked user keymap', async () => {
    const onChange = await mount(ELSEWISE, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));
    // The user's Vim is listed before the plugin's.
    await userEvent.click(page.getByRole('option', { name: 'Vim' }).first());

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(MINE);
  });

  test('returns picked plugin keymap', async () => {
    const onChange = await mount(ELSEWISE, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));
    await userEvent.click(page.getByRole('group', { name: 'Example' }).getByRole('option', { name: 'Vim' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith({ source: 'plugin', plugin: 'io.example', id: 'vim' });
  });

  test('filters by search', async () => {
    await mount(ELSEWISE, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));
    await userEvent.fill(page.getByPlaceholder('Search keymaps'), 'els');

    await expect.element(page.getByRole('option', { name: 'Elsewise' })).toBeVisible();
    expect(
      page
        .getByRole('option')
        .elements()
        .map((option) => option.textContent),
    ).toEqual(['Elsewise']);
  });

  test('fits longest name', async () => {
    const client = new QueryClient();
    client.setQueryData(userKeymapsQuery.queryKey, [
      { id: 'long', keymap: { name: 'Visual Studio Code with Emacs bindings (macOS)', keys: {} } },
    ]);
    await render(
      <QueryClientProvider client={client}>
        <PluginStoreContext value={new PluginStore()}>
          <KeymapSelect label="Keymap" keymap={ELSEWISE} onChange={() => {}} />
        </PluginStoreContext>
      </QueryClientProvider>,
    );

    await userEvent.click(page.getByRole('combobox', { name: 'Keymap' }));

    const option = page.getByRole('option', { name: 'Visual Studio Code with Emacs bindings (macOS)' });
    await expect.element(option).toBeVisible();
    expect(option.element().scrollWidth).toBeLessThanOrEqual(option.element().clientWidth);
  });
});

describe('KeymapActions', () => {
  const FIND = 'elsewise.editor.search.find';

  const MINE: Keymap = { name: 'Mine', keys: { [FIND]: ['Mod-Shift-x', 'F9'] } };

  const VIM: Keymap = { name: 'Vim', keys: { [FIND]: ['F9'] } };

  const SELECT_MINE: FrontendSettings = { ...DEFAULT_FRONTEND_SETTINGS, keymap: { source: 'user', id: 'mine' } };

  const SELECT_VIM: FrontendSettings = {
    ...DEFAULT_FRONTEND_SETTINGS,
    keymap: { source: 'plugin', plugin: 'io.example', id: 'vim' },
  };

  // Renders the actions on `keymap`, the user keymap `MINE` when `user`, with `settings`. Returns the bridge's saves and
  // deletes.
  async function mount(keymap: Keymap, user: string | undefined, settings: FrontendSettings) {
    const save = vi.fn(async () => {});
    const saveUserKeymap = vi.fn(async () => {});
    const deleteUserKeymap = vi.fn(async () => {});
    window.bridge = {
      settings: {
        load: async () => settings,
        save,
        loadPlugin: async () => ({}),
        savePlugin: async () => {},
        loadUserThemes: async () => [],
        saveUserTheme: async () => {},
        deleteUserTheme: async () => {},
        loadUserKeymaps: async () => [{ id: 'mine', keymap: MINE }],
        saveUserKeymap,
        deleteUserKeymap,
        onChange: () => {},
      },
    };
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, settings);
    client.setQueryData(userKeymapsQuery.queryKey, [{ id: 'mine', keymap: MINE }]);
    await render(
      <QueryClientProvider client={client}>
        <KeymapActions field={{ current: null }} keymap={keymap} onRename={() => {}} user={user} />
      </QueryClientProvider>,
    );
    return { save, saveUserKeymap, deleteUserKeymap };
  }

  test('disables rename and delete on plugin keymap', async () => {
    await mount(VIM, undefined, SELECT_VIM);

    await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));

    await expect.element(page.getByRole('menuitem', { name: 'Rename…' })).toHaveAttribute('aria-disabled', 'true');
    await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    await expect.element(page.getByRole('menuitem', { name: 'Duplicate' })).not.toHaveAttribute('aria-disabled');
  });

  test('duplicates keymap', async () => {
    const { save, saveUserKeymap } = await mount(VIM, undefined, SELECT_VIM);

    await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Duplicate' }));

    await expect.poll(() => saveUserKeymap.mock.calls.length).toBe(1);
    expect(saveUserKeymap).toHaveBeenCalledWith('vim-copy', { name: 'Vim copy', keys: { [FIND]: ['F9'] } });
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({ ...SELECT_VIM, keymap: { source: 'user', id: 'vim-copy' } });
  });

  test('deletes user keymap after confirming', async () => {
    const { save, deleteUserKeymap } = await mount(MINE, 'mine', SELECT_MINE);

    await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));
    const dialog = page.getByRole('dialog', { name: 'Delete “Mine” keymap?' });
    await expect.element(dialog).toHaveAccessibleDescription('This cannot be undone.');
    await expect.element(dialog).toBeVisible();
    expect(deleteUserKeymap).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));

    await expect.poll(() => deleteUserKeymap.mock.calls.length).toBe(1);
    expect(deleteUserKeymap).toHaveBeenCalledWith('mine');
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({ ...SELECT_MINE, keymap: DEFAULT_FRONTEND_SETTINGS.keymap });
  });
});
