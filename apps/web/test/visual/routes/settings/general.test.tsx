import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { HighlightProvider } from '@elsewise/components/components/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { General } from '@/routes/settings/appearance/general';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../sheet';

test.each(THEMES)('general (%s)', async (theme) => {
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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`general-${theme}`);
});
