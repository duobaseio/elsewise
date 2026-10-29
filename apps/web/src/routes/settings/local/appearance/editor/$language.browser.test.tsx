import { DEFAULT_SETTINGS, type InstalledPlugin, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    editor: {
      ...DEFAULT_SETTINGS.appearance.editor,
      tabSize: 4,
      indentUnit: '  ',
      lineSeparator: null,
      visualGuides: [120],
      languages: { Markdown: { lineSeparator: '\n' }, Elm: {} },
    },
  },
};

// A plugin that previews a language of its own and replaces Rust's preview.
const PREVIEWS: InstalledPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', main: 'main.js' },
  enabled: true,
  url: `data:text/javascript,${encodeURIComponent(`
    export default function () {
      return {
        onEnable(app) {
          return [
            app.settings.addLanguagePreviews([
              { language: 'Toy', path: 'sample.toy', code: 'toy sample\\n' },
              { language: 'Rust', path: 'sample.rs', code: 'fn plugin() {}\\n' },
              { language: 'JSX', path: 'sample.jsx', code: 'const jsx = <p />;\\n' },
            ]),
          ];
        },
      };
    }
  `)}`,
};

afterEach(() => {
  window.bridge = undefined;
});

// Opens the page of `language` with `settings` and `plugins`, waiting for its heading `label`. Returns the bridge's
// save and the router.
async function mount(language: string, settings = SETTINGS, label = language, plugins: InstalledPlugin[] = []) {
  const save = vi.fn(async () => {});
  window.bridge = {
    settings: { load: async () => settings, save, loadPlugin: async () => ({}), savePlugin: async () => {} },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  client.setQueryData(pluginsQuery.queryKey, plugins);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/settings/local/appearance/editor/${language}`] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: label })).toBeVisible();
  return { save, router };
}

function withLanguages(languages: Settings['appearance']['editor']['languages']): Settings {
  return { ...SETTINGS, appearance: { ...SETTINGS.appearance, editor: { ...SETTINGS.appearance.editor, languages } } };
}

describe('Language', () => {
  test('offers Reset on overridden row only', async () => {
    await mount('Markdown');

    await expect.element(page.getByRole('button', { name: 'Reset Line endings' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Reset Tab width' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Tab width' })).toHaveValue('4');
  });

  test('writes changed inherited value under language only', async () => {
    const { save } = await mount('Markdown');

    await userEvent.fill(page.getByRole('textbox', { name: 'Tab width' }), '2');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenLastCalledWith(withLanguages({ Markdown: { lineSeparator: '\n', tabSize: 2 }, Elm: {} }));
    await expect.element(page.getByRole('button', { name: 'Reset Tab width' })).toBeVisible();
  });

  test('reset drops key, keeping entry', async () => {
    const { save } = await mount('Markdown');

    await userEvent.click(page.getByRole('button', { name: 'Reset Line endings' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenLastCalledWith(withLanguages({ Markdown: {}, Elm: {} }));
    await expect.element(page.getByRole('button', { name: 'Reset Line endings' })).not.toBeInTheDocument();
  });

  test('reset empties entry, keeping it', async () => {
    const { save } = await mount('Markdown');

    await userEvent.click(page.getByRole('button', { name: 'Reset', exact: true }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenLastCalledWith(withLanguages({ Markdown: {}, Elm: {} }));
    await expect.element(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Remove language' })).toBeEnabled();
  });

  test('removes language, returning to Editor', async () => {
    const { save, router } = await mount('Elm');
    await userEvent.click(page.getByRole('button', { name: 'Remove language' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenLastCalledWith(withLanguages({ Markdown: { lineSeparator: '\n' } }));
    await expect.element(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor');
  });

  test('redirects to language listed as', async () => {
    const { router } = await mount('JSX', SETTINGS, 'JavaScript/JSX');
    expect(router.state.location.pathname).toBe('/settings/local/appearance/editor/JavaScript');
  });

  test('previews plugin language, and built-in language with plugin snippet', async () => {
    await mount('Toy', SETTINGS, 'Toy', [PREVIEWS]);
    await expect.element(page.getByText('toy sample')).toBeVisible();

    await mount('Rust', SETTINGS, 'Rust', [PREVIEWS]);
    await expect.element(page.getByText('fn plugin() {}')).toBeVisible();
  });

  test('previews language with plugin snippet keyed by name it is listed as', async () => {
    await mount('JavaScript', SETTINGS, 'JavaScript/JSX', [PREVIEWS]);
    await expect.element(page.getByText('const jsx = <p />;')).toBeVisible();
  });

  test('disables reset without overrides', async () => {
    await mount('Rust');
    await expect.element(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  });

  test('previews language, or shows there is none', async () => {
    await mount('Markdown');
    await expect.element(page.getByText('No preview for this language.')).not.toBeInTheDocument();
    await expect.poll(() => document.querySelector('.cm-editor')).not.toBeNull();

    await mount('Elm');
    await expect.element(page.getByText('No preview for this language.')).toBeVisible();
  });
});
