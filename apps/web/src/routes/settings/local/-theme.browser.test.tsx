import type { InstalledFrontendPlugin } from '@elsewise/bridge';
import type { ThemeId } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { userThemesQuery } from '@/appearance/themes';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { ThemeSelect } from '@/routes/settings/local/-theme';
import { pluginStore } from '../../../../test/plugins';

const DRACULA: ThemeId = { source: 'elsewise', id: 'dracula' };

const MISSING: ThemeId = { source: 'plugin', plugin: 'io.missing', id: 'dusk' };

const NIGHT = { name: 'Night', dark: { interface: { background: '#000000' }, editor: {}, terminal: {} } };

// A plugin with a theme named like the user's.
const PLUGIN: InstalledFrontendPlugin = {
  manifest: { id: 'io.example', name: 'Example', version: '1.0.0', elsewise: '^1.0.0', frontend: { main: 'main.js' } },
  enabled: true,
  themes: [{ id: 'night', theme: NIGHT }],
  keymaps: [],
  url: '',
};

// Renders a select showing `theme`, with `PLUGIN` installed and a user theme when `others`. Returns its onChange.
async function mount(theme: ThemeId | null, others = false) {
  const onChange = vi.fn();
  const client = new QueryClient();
  client.setQueryData(userThemesQuery.queryKey, others ? [{ id: 'night', theme: NIGHT }] : []);
  const store = await pluginStore(others ? [PLUGIN] : []);
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={store}>
        <ThemeSelect inheritable label="Theme" theme={theme} onChange={onChange} />
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  return onChange;
}

function shown() {
  return document.querySelector('[aria-label="Theme"] [data-slot="combobox-value"]')?.textContent;
}

describe('ThemeSelect', () => {
  test('shows interface theme for null', async () => {
    await mount(null);

    await expect.poll(shown).toBe('Same as interface');
  });

  test('shows theme', async () => {
    await mount(DRACULA);

    await expect.poll(shown).toBe('Dracula');
  });

  test('returns picked theme', async () => {
    const onChange = await mount(null);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(DRACULA);
  });

  test('returns null for interface theme', async () => {
    const onChange = await mount(DRACULA);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Same as interface' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('labels plugin group', async () => {
    await mount(null, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));

    await expect
      .element(page.getByRole('group', { name: 'Example' }).getByRole('option', { name: 'Night' }))
      .toBeVisible();
    expect(page.getByRole('group', { name: 'Example' }).getByRole('option').elements()).toHaveLength(1);
  });

  test('returns picked user theme', async () => {
    const onChange = await mount(null, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    // The user's Night is listed before the plugin's.
    await userEvent.click(page.getByRole('option', { name: 'Night' }).first());

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith({ source: 'user', id: 'night' });
  });

  test('shows default for missing theme', async () => {
    await mount(MISSING);

    await expect.poll(shown).toBe('Same as interface');
  });

  test('returns shown default for missing theme', async () => {
    const onChange = await mount(MISSING);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Same as interface' }));

    await expect.poll(() => onChange.mock.calls.length).toBe(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('shows Elsewise for missing theme unless inheritable', async () => {
    const client = new QueryClient();
    client.setQueryData(userThemesQuery.queryKey, []);
    await render(
      <QueryClientProvider client={client}>
        <PluginStoreContext value={new PluginStore()}>
          <ThemeSelect label="Theme" theme={MISSING} onChange={() => {}} />
        </PluginStoreContext>
      </QueryClientProvider>,
    );

    await expect.poll(shown).toBe('Elsewise');
  });

  test('omits interface theme unless inheritable', async () => {
    const client = new QueryClient();
    client.setQueryData(userThemesQuery.queryKey, []);
    await render(
      <QueryClientProvider client={client}>
        <PluginStoreContext value={new PluginStore()}>
          <ThemeSelect label="Theme" theme={DRACULA} onChange={() => {}} />
        </PluginStoreContext>
      </QueryClientProvider>,
    );

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));

    await expect.element(page.getByRole('option', { name: 'Dracula' })).toBeVisible();
    expect(page.getByRole('option', { name: 'Same as interface' }).elements()).toHaveLength(0);
  });

  test('filters by search', async () => {
    await mount(null, true);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.fill(page.getByPlaceholder('Search themes'), 'dra');

    await expect.element(page.getByRole('option', { name: 'Dracula' })).toBeVisible();
    expect(
      page
        .getByRole('option')
        .elements()
        .map((option) => option.textContent),
    ).toEqual(['Dracula']);
  });

  test('fits longest name', async () => {
    await mount(null);

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));

    const option = page.getByRole('option', { name: 'Catppuccin Macchiato (Dark mode only)' });
    await expect.element(option).toBeVisible();
    expect(option.element().scrollWidth).toBeLessThanOrEqual(option.element().clientWidth);
  });
});
