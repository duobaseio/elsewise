import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { HighlightProvider } from '@elsewise/components/components/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { General } from '@/routes/settings/appearance/general';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  window.bridge = undefined;
});

// Renders the page with `settings`, highlighting the row `highlight`. Returns the bridge's save.
async function mount(settings: Settings = DEFAULT_SETTINGS, highlight?: string) {
  const save = vi.fn(async () => {});
  window.bridge = {
    settings: { load: async () => settings, save, loadPlugin: async () => ({}), savePlugin: async () => {} },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  // The page links to its siblings, so it needs a router around it.
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <HighlightProvider id={highlight}>
          <General />
        </HighlightProvider>
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
  return save;
}

function withGeneral(changes: Partial<Settings['appearance']['general']>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, ...changes },
    },
  };
}

describe('General', () => {
  test('saves brightness', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Brightness' }));
    await userEvent.click(page.getByRole('option', { name: 'Dark' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ brightness: 'dark' }));
  });

  test('saves theme', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ theme: { source: 'elsewise', name: 'dracula' } }));
  });

  test.each([true, false])('reflects ligatures (%s)', async (ligatures) => {
    await mount(withGeneral({ font: { ...DEFAULT_SETTINGS.appearance.general.font, ligatures } }));
    const toggle = page.getByRole('switch', { name: 'Ligatures' });
    await (ligatures ? expect.element(toggle).toBeChecked() : expect.element(toggle).not.toBeChecked());
  });

  test('saves only ligatures leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Ligatures' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(
      withGeneral({ font: { ...DEFAULT_SETTINGS.appearance.general.font, ligatures: false } }),
    );
  });

  test('saves font size', async () => {
    const save = await mount();
    await userEvent.click(page.getByRole('combobox', { name: 'Font size' }));
    await userEvent.click(page.getByRole('option', { name: '16' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ font: { ...DEFAULT_SETTINGS.appearance.general.font, size: 16 } }));
  });

  test('saves only git status badges leaf', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Git status badges' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withGeneral({ gitStatusBadges: false }));
  });

  test('washes highlighted row only', async () => {
    await mount(DEFAULT_SETTINGS, 'ligatures');

    expect(document.querySelectorAll('[data-highlighted]')).toHaveLength(1);
    expect(document.querySelector('#ligatures')).toHaveAttribute('data-highlighted');
  });
});
