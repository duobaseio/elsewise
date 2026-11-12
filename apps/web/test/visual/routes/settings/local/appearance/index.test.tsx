import { HighlightProvider } from '@elsewise/components/components/settings';
import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { Appearance } from '@/routes/settings/local/appearance';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../../../sheet';

// Renders the appearance page on a sheet in `theme`.
async function mount(theme: (typeof THEMES)[number]) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_FRONTEND_SETTINGS);
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <div
          className="bg-background font-sans text-foreground"
          data-brightness={theme}
          data-testid="sheet"
          style={{ width: 800 }}
        >
          <HighlightProvider id="theme">
            <Appearance />
          </HighlightProvider>
        </div>
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
}

test.each(THEMES)('appearance (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`appearance-${theme}`);
});

test.each(THEMES)('appearance font groups (%s)', async (theme) => {
  // The popup is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  window.queryLocalFonts = async () => [{ family: 'Helvetica' }, { family: 'Menlo' }];
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
    delete window.queryLocalFonts;
  });
  await mount(theme);

  await userEvent.click(page.getByRole('combobox', { name: 'Font' }));
  await expect.element(page.getByRole('option', { name: 'Menlo' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`appearance-font-groups-${theme}`);
});
