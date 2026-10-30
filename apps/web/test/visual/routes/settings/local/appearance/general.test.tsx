import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { HighlightProvider } from '@elsewise/components/components/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { General } from '@/routes/settings/local/appearance/general';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../../../sheet';

// Renders the general page on a sheet in `theme`.
async function mount(theme: (typeof THEMES)[number]) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
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
            <General />
          </HighlightProvider>
        </div>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <RouterProvider router={router} />
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
}

test.each(THEMES)('general (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`general-${theme}`);
});

test.each(THEMES)('general font groups (%s)', async (theme) => {
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

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`general-font-groups-${theme}`);
});
