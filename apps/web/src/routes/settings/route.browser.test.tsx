import { DEFAULT_SETTINGS, type InstalledPlugin, type Settings } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

// A plugin that adds local panels, one of them throwing, and a remote panel.
const PANELS: InstalledPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' },
  enabled: true,
  url: `data:text/javascript,${encodeURIComponent(`
    export default function () {
      return {
        onEnable(app) {
          return [
            app.settings.add([
              {
                scope: 'local',
                id: 'io.example.words',
                label: 'Words',
                in: 'appearance',
                terms: { dictionary: { label: 'Dictionary', keywords: ['spelling'] } },
                component: () => 'Dictionary',
              },
              { scope: 'local', id: 'io.example.hooks', label: 'Hooks', in: 'appearance', terms: {}, component: () => 'Hooks' },
              {
                scope: 'local',
                id: 'io.example.words.spelling',
                label: 'Spelling',
                in: 'io.example.words',
                terms: { locale: { label: 'Locale', keywords: ['language', 'region'] } },
                component: () => 'Spelling',
              },
              { scope: 'local', id: 'io.example.broken', label: 'Broken', in: 'appearance', terms: {}, component: () => { throw new Error('boom'); } },
              {
                scope: 'remote',
                id: 'io.example.shell',
                label: 'Shell',
                in: 'appearance',
                terms: { program: { label: 'Program', keywords: ['shell'] } },
                component: ({ id }) => 'Shell on ' + id,
              },
            ]),
          ];
        },
      };
    }
  `)}`,
};

// Settings with overrides for a language listed under another, and one that is unknown.
const LANGUAGES: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    editor: { ...DEFAULT_SETTINGS.appearance.editor, languages: { Markdown: {}, JavaScript: {}, Elm: {} } },
  },
};

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
});

// The sidebar, whose links a page's own links must not be mistaken for.
function sidebar() {
  return page.elementLocator(document.querySelector('[data-slot="sidebar"]') as HTMLElement);
}

// Renders the app at the last of `entries`, with the others behind it in the history, and `plugins` installed.
async function mount(entries: string[], plugins: InstalledPlugin[] = [], settings = DEFAULT_SETTINGS) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  client.setQueryData(pluginsQuery.queryKey, plugins);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: entries }) });
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/settings/', () => {
  test('opens general', async () => {
    const router = await mount(['/settings']);
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });

  test('reopens last page', async () => {
    const router = await mount(['/settings/local/appearance/terminal']);
    await expect.element(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();

    await router.navigate({ to: '/settings' });

    expect(router.state.location.pathname).toBe('/settings/local/appearance/terminal');
  });

  test('reopens last page after leaving', async () => {
    const router = await mount(['/elsewhere', '/settings/local/appearance/terminal']);
    await expect.element(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
    router.history.back();
    await expect.poll(() => router.state.location.pathname).toBe('/elsewhere');

    await router.navigate({ to: '/settings' });

    expect(router.state.location.pathname).toBe('/settings/local/appearance/terminal');
  });

  test('redirects last page gone to general', async () => {
    localStorage.setItem('elsewise.settings.page', '/settings/local/io.example.missing');
    const router = await mount(['/settings']);

    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });

  test('redirects last page outside scopes to general', async () => {
    localStorage.setItem('elsewise.settings.page', '/settings/appearance/terminal');
    const router = await mount(['/settings']);

    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });
});

describe('Settings', () => {
  test('saves page without highlight', async () => {
    await mount(['/settings/local/appearance/terminal?highlight=scrollback']);
    await expect.element(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();

    expect(localStorage.getItem('elsewise.settings.page')).toBe('/settings/local/appearance/terminal');
  });

  test('shows page of each link, marking it active', async () => {
    await mount(['/settings']);
    for (const name of ['Editor', 'Terminal', 'General']) {
      await userEvent.click(sidebar().getByRole('link', { name }));
      await expect.element(page.getByRole('heading', { name })).toBeVisible();
      await expect.element(sidebar().getByRole('link', { name })).toHaveAttribute('data-active');
    }
    await expect.element(sidebar().getByRole('link', { name: 'Editor' })).not.toHaveAttribute('data-active');
  });

  test('lists plugins after built-in pages of group, in order added', async () => {
    await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Hooks' })).toBeVisible();

    const links = sidebar()
      .getByRole('link')
      .elements()
      .map((link) => link.textContent);
    expect(links).toEqual(['General', 'Editor', 'Terminal', 'Words', 'Hooks', 'Broken']);
  });

  test('lists languages under editor, sorted by label, expanded when open', async () => {
    const router = await mount(['/settings'], [], LANGUAGES);
    await expect.element(sidebar().getByRole('link', { name: 'Editor' })).toBeVisible();
    await expect.element(sidebar().getByRole('link', { name: 'Markdown' })).not.toBeInTheDocument();

    await userEvent.click(sidebar().getByRole('button', { name: 'Expand Editor' }));
    const links = sidebar()
      .getByRole('link')
      .elements()
      .map((link) => link.textContent);
    expect(links).toEqual(['General', 'Editor', 'Elm', 'JavaScript/JSX', 'Markdown', 'Terminal']);

    await userEvent.click(sidebar().getByRole('link', { name: 'JavaScript/JSX' }));
    await expect.element(page.getByRole('heading', { name: 'JavaScript/JSX' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor/JavaScript');
    await expect.element(sidebar().getByRole('link', { name: 'JavaScript/JSX' })).toHaveAttribute('data-active');
    await expect.element(sidebar().getByRole('link', { name: 'Editor' })).not.toHaveAttribute('data-active');
  });

  test('keeps highlight on modifier key', async () => {
    const router = await mount(['/settings/local/appearance/general?highlight=brightness']);
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();

    for (const key of ['{Shift}', '{Meta}', '{Control}', '{Alt}']) {
      await userEvent.keyboard(key);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.state.location.search).toEqual({ highlight: 'brightness' });
  });

  test('clears highlight on pointer or other key', async () => {
    const router = await mount(['/settings/local/appearance/general?highlight=brightness']);
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await expect.poll(() => router.state.location.search).toEqual({});

    await router.navigate({ to: '.', search: { highlight: 'font' } });
    await expect.poll(() => router.state.location.search).toEqual({ highlight: 'font' });
    await userEvent.click(page.getByRole('heading', { name: 'General' }));
    await expect.poll(() => router.state.location.search).toEqual({});
  });

  test('returns to previous page', async () => {
    const router = await mount(['/settings/local/appearance/terminal', '/settings/local/appearance/general']);
    await userEvent.click(page.getByRole('button', { name: 'Back' }));
    await expect.element(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/terminal');
  });
});

describe('Item', () => {
  test('lists panels in panel under it, expanded on demand or when open', async () => {
    const router = await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await expect.element(sidebar().getByRole('link', { name: 'Spelling' })).not.toBeInTheDocument();

    await userEvent.click(sidebar().getByRole('button', { name: 'Expand Words' }));
    await expect.element(sidebar().getByRole('link', { name: 'Spelling' })).toBeVisible();

    await userEvent.dblClick(sidebar().getByRole('link', { name: 'Words' }));
    await expect.element(sidebar().getByRole('link', { name: 'Spelling' })).not.toBeInTheDocument();

    await router.navigate({ to: '/settings/local/$id', params: { id: 'io.example.words.spelling' } });
    await expect.element(sidebar().getByRole('link', { name: 'Spelling' })).toHaveAttribute('data-active');
    await expect.poll(() => page.getByRole('main').element().textContent).toContain('Spelling');
  });

  test('shows open language page under editor', async () => {
    await mount(['/settings/local/appearance/editor/Markdown'], [], LANGUAGES);
    await expect.element(page.getByRole('heading', { name: 'Markdown' })).toBeVisible();
    await expect.element(sidebar().getByRole('link', { name: 'Markdown' })).toHaveAttribute('data-active');
  });
});

describe('AddLanguage', () => {
  test('saves language without override, excluding listed and those listed under another, and opens it', async () => {
    const save = vi.fn(async () => {});
    window.bridge = {
      settings: { load: async () => LANGUAGES, save, loadPlugin: async () => ({}), savePlugin: async () => {} },
    };
    const router = await mount(['/settings/local/appearance/editor'], [], LANGUAGES);
    await userEvent.click(sidebar().getByRole('combobox', { name: 'Add language' }));
    await userEvent.fill(page.getByPlaceholder('Search languages'), 'J');

    const options = page
      .getByRole('option')
      .elements()
      .map((option) => option.textContent);
    expect(options).toContain('Java');
    expect(options).not.toContain('JavaScript/JSX');
    expect(options).not.toContain('JSX');

    await userEvent.click(page.getByRole('option', { name: 'Java', exact: true }));

    await expect.element(page.getByRole('heading', { name: 'Java' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor/Java');
    await expect.element(sidebar().getByRole('link', { name: 'Java' })).toHaveAttribute('data-active');
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({
      ...LANGUAGES,
      appearance: {
        ...LANGUAGES.appearance,
        editor: { ...LANGUAGES.appearance.editor, languages: { ...LANGUAGES.appearance.editor.languages, Java: {} } },
      },
    });
  });
});

describe('Search', () => {
  test('opens setting it names, highlighted', async () => {
    const router = await mount(['/settings']);
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'crlf');

    const option = page.getByRole('option', { name: /Line endings/ });
    await expect.element(option).toBeVisible();
    await expect.element(option.getByText('Editor')).toBeVisible();

    await userEvent.click(option);

    await expect.element(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor');
    expect(router.state.location.search).toEqual({ highlight: 'lineSeparator' });
    await expect.element(page.getByRole('combobox', { name: 'Search' })).toHaveValue('');
  });

  test('opens language setting, highlighted', async () => {
    const router = await mount(['/settings'], [], LANGUAGES);
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'markdown tab');

    const option = page.getByRole('option', { name: /Tab width/ });
    await expect.element(option).toBeVisible();
    await expect.poll(() => option.element().textContent).toMatch(/Editor.*Markdown/);

    await userEvent.click(option);

    await expect.element(page.getByRole('heading', { name: 'Markdown' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor/Markdown');
    expect(router.state.location.search).toEqual({ highlight: 'tabSize' });
  });

  test('opens plugin panel', async () => {
    const router = await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Hooks' })).toBeVisible();
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'spell');

    const option = page.getByRole('option', { name: /Dictionary/ });
    await expect.element(option.getByText('Words')).toBeVisible();

    await userEvent.click(option);

    expect(router.state.location.pathname).toBe('/settings/local/io.example.words');
    expect(router.state.location.search).toEqual({ highlight: 'dictionary' });
  });

  test('finds panels of current scope only', async () => {
    const router = await mount(['/settings'], [PANELS]);
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'program');
    await expect.element(page.getByText('No settings found')).toBeVisible();

    await router.navigate({
      to: '/settings/remote/$remote/$id',
      params: { remote: 'dev-box', id: 'io.example.shell' },
    });
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'dictionary');
    await expect.element(page.getByText('No settings found')).toBeVisible();

    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'program');
    await userEvent.click(page.getByRole('option', { name: /Program/ }));

    expect(router.state.location.pathname).toBe('/settings/remote/dev-box/io.example.shell');
    expect(router.state.location.search).toEqual({ highlight: 'program' });
  });

  test('shows nested panel under parent', async () => {
    await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'region');

    await expect
      .poll(() => page.getByRole('option', { name: /Locale/ }).element().textContent)
      .toMatch(/Words.*Spelling/);
  });

  test('shows no-match message', async () => {
    await mount(['/settings']);
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'zzzz');

    await expect.element(page.getByText('No settings found')).toBeVisible();
  });

  test('finds option as meta on mac only', async () => {
    await mount(['/settings']);
    await userEvent.fill(page.getByRole('combobox', { name: 'Search' }), 'option as meta');

    await expect
      .element(
        PLATFORM === 'mac' ? page.getByRole('option', { name: /Option as Meta/ }) : page.getByText('No settings found'),
      )
      .toBeVisible();
  });

  test('focuses on find shortcut', async () => {
    await mount(['/settings']);
    await userEvent.keyboard(PLATFORM === 'mac' ? '{Meta>}f{/Meta}' : '{Control>}f{/Control}');

    await expect.element(page.getByPlaceholder('Search')).toHaveFocus();
  });
});

describe('LocalPanel', () => {
  test('shows panel, marking it active', async () => {
    const router = await mount(['/settings'], [PANELS]);
    await userEvent.click(sidebar().getByRole('link', { name: 'Words' }));
    await expect.poll(() => page.getByRole('main').element().textContent).toContain('Dictionary');
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toHaveAttribute('data-active');
    expect(router.state.location.pathname).toBe('/settings/local/io.example.words');
  });

  test('lists local panels only', async () => {
    await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await expect.element(sidebar().getByRole('link', { name: 'Shell' })).not.toBeInTheDocument();
  });

  test('redirects unknown panel to general', async () => {
    const router = await mount(['/settings/local/io.example.missing']);
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });

  test('redirects remote panel to general', async () => {
    const router = await mount(['/settings/local/appearance/terminal'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await router.navigate({ to: '/settings/local/$id', params: { id: 'io.example.shell' } });
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });
});

describe('RemotePanel', () => {
  test('shows panel for remote, listing remote panels only', async () => {
    const router = await mount(['/settings'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await router.navigate({
      to: '/settings/remote/$remote/$id',
      params: { remote: 'dev-box', id: 'io.example.shell' },
    });
    await expect.poll(() => page.getByRole('main').element().textContent).toContain('Shell on dev-box');
    await expect.element(sidebar().getByRole('link', { name: 'Shell' })).toHaveAttribute('data-active');
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).not.toBeInTheDocument();
    await expect.element(sidebar().getByRole('link', { name: 'General' })).not.toBeInTheDocument();
  });

  test('redirects local panel to general', async () => {
    const router = await mount(['/settings/local/appearance/terminal'], [PANELS]);
    await expect.element(sidebar().getByRole('link', { name: 'Words' })).toBeVisible();
    await router.navigate({
      to: '/settings/remote/$remote/$id',
      params: { remote: 'dev-box', id: 'io.example.words' },
    });
    await expect.element(page.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/general');
  });
});

describe('PanelError', () => {
  test('replaces throwing panel with why', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(['/settings'], [PANELS]);
    await userEvent.click(sidebar().getByRole('link', { name: 'Broken' }));
    await expect.element(page.getByRole('heading', { name: 'Could not show these settings' })).toBeVisible();
    await expect.element(page.getByText('boom')).toBeVisible();
  });
});
