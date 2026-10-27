import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
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

afterEach(() => {
  window.bridge = undefined;
});

// Opens the Editor page with `settings`. Returns the bridge's save and the router.
async function mount(settings = SETTINGS) {
  const save = vi.fn(async () => {});
  window.bridge = {
    settings: { load: async () => settings, save, loadPlugin: async () => ({}), savePlugin: async () => {} },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  client.setQueryData(pluginsQuery.queryKey, []);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/appearance/editor'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  return { save, router };
}

function withEditor(changes: Partial<Settings['appearance']['editor']>): Settings {
  return { ...SETTINGS, appearance: { ...SETTINGS.appearance, editor: { ...SETTINGS.appearance.editor, ...changes } } };
}

describe('Editor', () => {
  test('saves theme', async () => {
    const { save } = await mount();

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ theme: { source: 'elsewise', name: 'dracula' } }));
  });

  test.each([
    ['Line numbers', 'lineNumbers'],
    ['Line wrapping', 'lineWrapping'],
    ['Completion documentation', 'completionDocumentation'],
    ['Highlight usages', 'highlightUsages'],
    ['Scrollbar markers', 'scrollbarMarkers'],
  ] as const)('toggles %s', async (label, key) => {
    const { save } = await mount();
    await userEvent.click(page.getByRole('switch', { name: label }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ [key]: !SETTINGS.appearance.editor[key] }));
  });

  test('saves diff layout', async () => {
    const { save } = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Diff layout' }));
    await userEvent.click(page.getByRole('option', { name: 'Unified' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ diffLayout: 'unified' }));
  });

  test('saves font size', async () => {
    const { save } = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Font size' }));
    await userEvent.click(page.getByRole('option', { name: '14' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ font: { ...SETTINGS.appearance.editor.font, size: 14 } }));
  });

  test('saves line height', async () => {
    const { save } = await mount();

    await userEvent.fill(page.getByRole('textbox', { name: 'Line height' }), '1.8');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ font: { ...SETTINGS.appearance.editor.font, lineHeight: 1.8 } }));
  });

  test('saves tab width', async () => {
    const { save } = await mount();
    await userEvent.fill(page.getByRole('textbox', { name: 'Tab width' }), '8');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenLastCalledWith(withEditor({ tabSize: 8 }));
  });
});
