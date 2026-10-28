import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { builtInCommands } from '../../test/commands';
import { OPEN_SETTINGS, settingsQuery, useEditorSettings } from './settings';

describe('useEditorSettings', () => {
  // Renders the setting `key` of `language` into the page.
  async function mount(language: string, key: 'tabSize') {
    const client = new QueryClient();
    client.setQueryData(settingsQuery.queryKey, {
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        editor: { ...DEFAULT_SETTINGS.appearance.editor, tabSize: 4, languages: { JavaScript: { tabSize: 2 } } },
      },
    });
    function Setting() {
      return <output>{useEditorSettings(language, key)}</output>;
    }
    await render(
      <QueryClientProvider client={client}>
        <Setting />
      </QueryClientProvider>,
    );
    return page.getByRole('status');
  }

  test('reads entry of language listed as', async () => {
    await expect.element(await mount('JSX', 'tabSize')).toHaveTextContent('2');
  });

  test('falls back to editor without entry', async () => {
    await expect.element(await mount('TSX', 'tabSize')).toHaveTextContent('4');
  });
});

describe('OPEN_SETTINGS', () => {
  async function open(pathname: string): Promise<string> {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: [pathname] }),
    });
    const { application } = builtInCommands();

    OPEN_SETTINGS.run({ ...application, router });

    await new Promise((resolve) => setTimeout(resolve));
    return router.history.location.pathname;
  }

  test('opens settings', async () => {
    await expect(open('/Elsewise/Singapore')).resolves.toBe('/settings');
  });

  test('keeps open settings page', async () => {
    await expect(open('/settings/appearance/terminal')).resolves.toBe('/settings/appearance/terminal');
  });
});
