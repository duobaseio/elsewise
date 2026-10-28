import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { pluginsQuery } from '@/plugins/loader';
import { routeTree } from '@/routeTree.gen';
import { settingsQuery } from '@/settings/settings';

afterEach(() => {
  window.bridge = undefined;
});

// Opens the Terminal page with the default settings. Returns the bridge's save.
async function mount() {
  const save = vi.fn(async () => {});
  window.bridge = {
    settings: { load: async () => DEFAULT_SETTINGS, save, loadPlugin: async () => ({}), savePlugin: async () => {} },
  };
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
  client.setQueryData(pluginsQuery.queryKey, []);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/settings/appearance/terminal'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
  return save;
}

function withTerminal(changes: Partial<Settings['appearance']['terminal']>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      terminal: { ...DEFAULT_SETTINGS.appearance.terminal, ...changes },
    },
  };
}

describe('Terminal', () => {
  test('shows preview', async () => {
    await mount();

    await expect.poll(() => document.querySelector('.xterm')).not.toBeNull();
  });

  test('saves theme', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('combobox', { name: 'Theme' }));
    await userEvent.click(page.getByRole('option', { name: 'Dracula' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ theme: { source: 'elsewise', name: 'dracula' } }));
  });

  test('saves cursor style', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('combobox', { name: 'Cursor style' }));
    await userEvent.click(page.getByRole('option', { name: 'Underline' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ cursorStyle: 'underline' }));
  });

  test('saves cursor blinking', async () => {
    const save = await mount();
    const toggle = page.getByRole('switch', { name: 'Cursor blinking' });
    await expect.element(toggle).toBeChecked();

    await userEvent.click(toggle);

    await expect.element(toggle).not.toBeChecked();
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ cursorBlink: false }));
  });

  test('saves ligatures', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('switch', { name: 'Ligatures' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(
      withTerminal({ font: { ...DEFAULT_SETTINGS.appearance.terminal.font, ligatures: false } }),
    );
  });

  test('saves line height within limits', async () => {
    const save = await mount();
    const input = page.getByRole('textbox', { name: 'Line height' });

    await userEvent.fill(input, '0.9');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.fill(input, '2.6');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    expect(save).not.toHaveBeenCalled();

    await userEvent.fill(input, '1.20');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(
      withTerminal({ font: { ...DEFAULT_SETTINGS.appearance.terminal.font, lineHeight: 1.2 } }),
    );
    await expect.element(input).toHaveValue('1.20');
  });

  test('keeps trailing zero of line height', async () => {
    const save = await mount();
    const input = page.getByRole('textbox', { name: 'Line height' });

    await userEvent.fill(input, '1.02');
    await expect.poll(() => save.mock.calls.length).toBe(1);
    await userEvent.keyboard('{Backspace}');

    await expect.poll(() => save.mock.calls.length).toBe(2);
    expect(save).toHaveBeenLastCalledWith(
      withTerminal({ font: { ...DEFAULT_SETTINGS.appearance.terminal.font, lineHeight: 1 } }),
    );
    await expect.element(input).toHaveValue('1.0');
  });

  test('saves copy on select', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('switch', { name: 'Copy on select' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ copyOnSelect: true }));
  });

  test.runIf(PLATFORM === 'mac')('saves option as meta', async () => {
    const save = await mount();

    await userEvent.click(page.getByRole('switch', { name: 'Option as Meta' }));

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ macOptionIsMeta: true }));
  });

  test.skipIf(PLATFORM === 'mac')('hides option as meta', async () => {
    await mount();
    await expect.element(page.getByRole('switch', { name: 'Cursor blinking' })).toBeVisible();

    expect(document.querySelector('[aria-label="Option as Meta"]')).toBeNull();
  });

  test('saves scrollback within limits', async () => {
    const save = await mount();
    const input = page.getByRole('textbox', { name: 'Scrollback' });

    await userEvent.fill(input, '500');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.fill(input, '200000');
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    expect(save).not.toHaveBeenCalled();

    await userEvent.fill(input, '20000');

    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith(withTerminal({ scrollback: 20000 }));
  });
});
