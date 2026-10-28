import { DEFAULT_SETTINGS, type InstalledPlugin, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../sheet';

// A plugin with a panel inside another, for a result's path. The tests open the outer one, which is blank, so that only
// the sidebar and search show.
const WORDS: InstalledPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' },
  enabled: true,
  url: `data:text/javascript,${encodeURIComponent(`
    export default function () {
      return {
        onEnable(app) {
          return [
            app.settings.add([
              { scope: 'local', id: 'io.example.words', label: 'Words', in: 'appearance', terms: {}, component: () => null },
              {
                scope: 'local',
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

// A few languages under the editor, for the sidebar to fit.
const LANGUAGES: Settings['appearance']['editor']['languages'] = { JavaScript: {}, Markdown: {}, Rust: {} };

async function mount(theme: 'light' | 'dark', languages = DEFAULT_SETTINGS.appearance.editor.languages) {
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
      editor: { ...DEFAULT_SETTINGS.appearance.editor, languages },
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
  await router.navigate({ to: '/settings/local/$id', params: { id: 'io.example.words' } });
  await expect.element(page.getByRole('heading', { name: 'General' })).not.toBeInTheDocument();
  await userEvent.hover(page.getByRole('main'));
}

test.each(THEMES)('settings panel in panel (%s)', async (theme) => {
  await mount(theme);
  await userEvent.click(page.getByRole('button', { name: 'Expand Words' }));
  await expect.element(page.getByRole('link', { name: 'Spelling' })).toBeVisible();
  await userEvent.hover(page.getByRole('main'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`sidebar-nested-${theme}`);
});

test.each(THEMES)('settings languages under editor (%s)', async (theme) => {
  await mount(theme, LANGUAGES);
  await userEvent.click(page.getByRole('button', { name: 'Expand Editor' }));
  await expect.element(page.getByRole('link', { name: 'Rust' })).toBeVisible();
  await expect.element(page.getByRole('combobox', { name: 'Add language' })).toBeVisible();
  await userEvent.hover(page.getByRole('main'));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`sidebar-languages-${theme}`);
});

test.each(THEMES)('settings search results (%s)', async (theme) => {
  await mount(theme);
  await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'col');
  await expect.poll(() => page.getByRole('option').elements().length).toBe(5);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-results-${theme}`);
});

test.each(THEMES)('settings search result in panel (%s)', async (theme) => {
  await mount(theme);
  await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'region');
  await expect.element(page.getByRole('option', { name: /Locale/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-nested-${theme}`);
});

test.each(THEMES)('settings search result for language (%s)', async (theme) => {
  await mount(theme, LANGUAGES);
  await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'markdown tab');
  await expect.element(page.getByRole('option', { name: /Tab width/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-language-${theme}`);
});

test.each(THEMES)('settings search without results (%s)', async (theme) => {
  await mount(theme);
  await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'zzzz');
  await expect.element(page.getByText('No settings found')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-empty-${theme}`);
});
