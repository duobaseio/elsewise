import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { FileTree } from '@/routes/settings/local/file-tree';
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
          <FileTree />
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'File tree' })).toBeVisible();
  return save;
}

function withFileTree(changes: Partial<FrontendSettings['fileTree']>): FrontendSettings {
  return { ...DEFAULT_FRONTEND_SETTINGS, fileTree: { ...DEFAULT_FRONTEND_SETTINGS.fileTree, ...changes } };
}

describe('FileTree', () => {
  test('saves only git status badges leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Git status badges' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withFileTree({ gitStatusBadges: false }));
  });

  test('saves only indent guides leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Indent guides' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withFileTree({ indentGuides: false }));
  });

  test.each([true, false])('help follows indent guides (%s)', async (indentGuides) => {
    await mount(withFileTree({ indentGuides }));

    await userEvent.hover(document.querySelector('#indentGuides [data-slot="row-help"]') as Element);

    await expect
      .poll(() => document.querySelector('[data-slot="tooltip-content"] [data-indent-guides]'))
      .not.toBeNull();
    const tree = document.querySelector('[data-slot="tooltip-content"] [data-indent-guides]');
    expect(tree?.getAttribute('data-indent-guides') !== 'false').toBe(indentGuides);
  });
});
