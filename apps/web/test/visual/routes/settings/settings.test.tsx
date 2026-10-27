import { DEFAULT_SETTINGS, type InstalledPlugin } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../sheet';

// A plugin with a panel inside another, for a result's path.
const WORDS: InstalledPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' },
  enabled: true,
  url: `data:text/javascript,${encodeURIComponent(`
    export default function () {
      return {
        onEnable(app) {
          return [
            app.settings.add([
              { id: 'io.example.words', label: 'Words', in: 'appearance', terms: {}, component: () => 'Words' },
              {
                id: 'io.example.words.spelling',
                label: 'Spelling',
                in: 'io.example.words',
                terms: { locale: { label: 'Locale', keywords: ['language', 'region'] } },
                component: () => 'Spelling',
              },
            ]),
          ];
        },
      };
    }
  `)}`,
};

describe.each(THEMES)('settings (%s)', (theme) => {
  async function mount() {
    // The app sets the page's brightness from the settings, which the search results, portalled to the body, take.
    onTestFinished(() => {
      delete document.documentElement.dataset.brightness;
    });
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, {
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
      },
    });
    client.setQueryData(pluginsQuery.queryKey, [WORDS]);
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/settings'] }) });
    await render(
      <div className="font-sans" data-brightness={theme} data-testid="sheet" style={{ width: 900, height: 480 }}>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </div>,
    );

    await expect.element(page.getByRole('link', { name: 'Words' })).toBeVisible();
    await userEvent.hover(page.getByRole('heading', { name: 'General' }));
  }

  test('panel in panel', async () => {
    await mount();
    await userEvent.click(page.getByRole('button', { name: 'Expand Words' }));
    await expect.element(page.getByRole('link', { name: 'Spelling' })).toBeVisible();
    await userEvent.hover(page.getByRole('heading', { name: 'General' }));

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`sidebar-nested-${theme}`);
  });

  test('search results', async () => {
    await mount();
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'col');
    await expect.poll(() => page.getByRole('option').elements().length).toBe(5);

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-results-${theme}`);
  });

  test('search result in panel', async () => {
    await mount();
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'region');
    await expect.element(page.getByRole('option', { name: /Locale/ })).toBeVisible();

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-nested-${theme}`);
  });

  test('search without results', async () => {
    await mount();
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'zzzz');
    await expect.element(page.getByText('No settings found')).toBeVisible();

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-empty-${theme}`);
  });
});
