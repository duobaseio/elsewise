import { DEFAULT_FRONTEND_SETTINGS, type FrontendSettings } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

const SETTINGS: FrontendSettings = {
  ...DEFAULT_FRONTEND_SETTINGS,
  appearance: {
    ...DEFAULT_FRONTEND_SETTINGS.appearance,
    editor: {
      ...DEFAULT_FRONTEND_SETTINGS.appearance.editor,
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
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/local/appearance/editor'] }),
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
  await expect.element(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  return { save, router };
}

function withEditor(changes: Partial<FrontendSettings['appearance']['editor']>): FrontendSettings {
  return { ...SETTINGS, appearance: { ...SETTINGS.appearance, editor: { ...SETTINGS.appearance.editor, ...changes } } };
}

describe('Editor', () => {
  test('saves theme', async () => {
    const { save } = await mount();

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withEditor({ theme: { source: 'elsewise', id: 'dracula' } }));
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

  test.each([true, false])('help follows completion documentation (%s)', async (completionDocumentation) => {
    await mount(withEditor({ completionDocumentation }));

    await userEvent.hover(document.querySelector('#completionDocumentation [data-slot="row-help"]') as Element);

    await expect
      .poll(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent)
      .toContain('Documentation may require a language server.');
    const documentation = expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent);
    if (completionDocumentation) {
      documentation.toContain('Returns an iterator over the slice.');
    } else {
      documentation.not.toContain('Returns an iterator over the slice.');
    }
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
