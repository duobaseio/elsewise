import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import type { Keymap as KeymapFile } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { userKeymapsQuery } from '@/command/keymap/keymap';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { Keymap } from '@/routes/settings/local/appearance/keymap';
import { settingsQuery } from '@/settings/settings';
import { builtInApplication } from '../../../../../commands';
import { THEMES } from '../../../../../sheet';

const SETTINGS = 'elsewise.application.settings.open';

const DUPLICATE = 'elsewise.editor.edit.duplicateLine';

const DUPLICATE_UP = 'elsewise.editor.edit.duplicateLineUp';

// Binds Duplicate line's key to Duplicate line up as well.
const MINE: KeymapFile = { name: 'Mine', keys: { [DUPLICATE_UP]: ['Mod-Shift-d', 'Mod-d'] } };

const SELECT_MINE: Settings = { ...DEFAULT_SETTINGS, keymap: { source: 'user', id: 'mine' } };

// Renders the keymap page with `settings` on a sheet in `theme`, scrolling inside a container as the settings do.
async function mount(theme: (typeof THEMES)[number], settings = DEFAULT_SETTINGS) {
  // Popups are portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
  client.setQueryData(userKeymapsQuery.queryKey, [{ id: 'mine', keymap: MINE }]);
  const application = builtInApplication();
  if (settings.keymap.source === 'user') {
    application.commands.selected = MINE;
  }
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ApplicationManagerContext value={application}>
          <main
            className="overflow-y-auto bg-background font-sans text-foreground [container-type:size]"
            data-brightness={theme}
            data-testid="sheet"
            style={{ width: 800, height: 600 }}
          >
            <Keymap />
          </main>
        </ApplicationManagerContext>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <RouterProvider router={router} />
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: 'Keymap', exact: true })).toBeVisible();
}

function row(id: string) {
  return page.elementLocator(document.getElementById(id) as HTMLElement);
}

function search() {
  return page.getByRole('textbox', { name: 'Search commands' });
}

test.each(THEMES)('keymap (%s)', async (theme) => {
  await mount(theme);
  await expect.element(row(SETTINGS)).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-${theme}`);
});

test.each(THEMES)('keymap modified and conflicting (%s)', async (theme) => {
  await mount(theme, SELECT_MINE);
  await expect.element(row(DUPLICATE_UP).getByRole('img', { name: 'Modified' })).toBeVisible();

  row(DUPLICATE).element().scrollIntoView();
  await expect.element(row(DUPLICATE).getByRole('note')).toBeInViewport();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-modified-conflicting-${theme}`);
});

test.each(THEMES)('keymap search (%s)', async (theme) => {
  await mount(theme);

  await userEvent.fill(search(), 'fold');
  await expect.element(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  await expect.poll(() => page.getByRole('option').elements().length).toBe(4);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-search-${theme}`);
});

test.each(THEMES)('keymap no results (%s)', async (theme) => {
  await mount(theme);

  await userEvent.fill(search(), 'zzz');
  await expect.element(page.getByText('No commands found')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-no-results-${theme}`);
});

test.each(THEMES)('keymap add shortcut (%s)', async (theme) => {
  await mount(theme);

  await userEvent.click(row(SETTINGS), { button: 'right' });
  await userEvent.click(page.getByRole('menuitem', { name: /^Add shortcut…/ }));
  await expect.element(page.getByRole('textbox', { name: 'Key' })).toHaveFocus();
  await userEvent.hover(page.getByRole('heading', { name: 'Keymap', exact: true }));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-add-shortcut-${theme}`);
});

test.each(THEMES)('keymap context menu (%s)', async (theme) => {
  await mount(theme);

  await userEvent.click(row(SETTINGS), { button: 'right' });
  await expect.element(page.getByRole('menuitem', { name: /^Redo/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-context-menu-${theme}`);
});

test.each(THEMES)('keymap actions (%s)', async (theme) => {
  await mount(theme);

  await userEvent.click(page.getByRole('button', { name: 'Keymap actions' }));
  await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`keymap-actions-${theme}`);
});
