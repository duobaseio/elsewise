import { HighlightProvider } from '@elsewise/components/components/settings';
import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { Appearance } from '@/routes/settings/local/appearance';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  window.bridge = undefined;
});

// Renders the page with `settings`, highlighting the row `highlight`. Returns the bridge's save.
async function mount(settings: FrontendSettings = DEFAULT_FRONTEND_SETTINGS, highlight?: string) {
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
  // The page links to its siblings, so it needs a router around it.
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <HighlightProvider id={highlight}>
          <Appearance />
        </HighlightProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  return save;
}

function withGeneral(changes: Partial<FrontendSettings['appearance']['general']>): FrontendSettings {
  return {
    ...DEFAULT_FRONTEND_SETTINGS,
    appearance: {
      ...DEFAULT_FRONTEND_SETTINGS.appearance,
      general: { ...DEFAULT_FRONTEND_SETTINGS.appearance.general, ...changes },
    },
  };
}

describe('Appearance', () => {
  test('saves brightness', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Brightness' }));
    await userEvent.click(page.getByRole('option', { name: 'Dark' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ brightness: 'dark' }));
  });

  test('saves theme', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ theme: { source: 'elsewise', id: 'dracula' } }));
  });

  test.each([true, false])('reflects ligatures (%s)', async (ligatures) => {
    await mount(withGeneral({ font: { ...DEFAULT_FRONTEND_SETTINGS.appearance.general.font, ligatures } }));
    const toggle = page.getByRole('switch', { name: 'Ligatures' });
    await (ligatures ? expect.element(toggle).toBeChecked() : expect.element(toggle).not.toBeChecked());
  });

  test('saves only ligatures leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Ligatures' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(
      withGeneral({ font: { ...DEFAULT_FRONTEND_SETTINGS.appearance.general.font, ligatures: false } }),
    );
  });

  test('saves font size', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Font size' }));
    await userEvent.click(page.getByRole('option', { name: '16' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(
      withGeneral({ font: { ...DEFAULT_FRONTEND_SETTINGS.appearance.general.font, size: 16 } }),
    );
  });

  test('saves only git status badges leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Git status badges' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ gitStatusBadges: false }));
  });

  test('saves only indent guides leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Indent guides' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ indentGuides: false }));
  });

  test.each([true, false])('help follows indent guides (%s)', async (indentGuides) => {
    await mount(withGeneral({ indentGuides }));

    await userEvent.hover(document.querySelector('#indentGuides [data-slot="row-help"]') as Element);

    await expect
      .poll(() => document.querySelector('[data-slot="tooltip-content"] [data-indent-guides]'))
      .not.toBeNull();
    const tree = document.querySelector('[data-slot="tooltip-content"] [data-indent-guides]');
    expect(tree?.getAttribute('data-indent-guides') !== 'false').toBe(indentGuides);
  });

  test('washes highlighted row only', async () => {
    await mount(DEFAULT_FRONTEND_SETTINGS, 'ligatures');

    expect(document.querySelectorAll('[data-highlighted]')).toHaveLength(1);
    expect(document.querySelector('#ligatures')).toHaveAttribute('data-highlighted');
  });
});
