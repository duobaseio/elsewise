import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { Workspace } from '@/routes/settings/local/workspace';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  window.bridge = undefined;
});

// Renders the page with `settings`. Returns the bridge's save.
async function mount(settings: FrontendSettings = DEFAULT_FRONTEND_SETTINGS) {
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
      <PluginStoreContext value={new PluginStore()}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <Workspace />
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  return save;
}

describe('Workspace', () => {
  test('shows tab on the left by default', async () => {
    await mount();

    const value = page
      .getByRole('combobox', { name: 'Tab after close' })
      .element()
      .querySelector('[data-slot="select-value"]');
    expect(value?.textContent).toBe('Tab on the left');
  });

  test('saves close activation', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('combobox', { name: 'Tab after close' }));
    await userEvent.click(page.getByRole('option', { name: 'Most recent tab' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_FRONTEND_SETTINGS, workspace: { closeActivation: 'recent' } });
  });
});
