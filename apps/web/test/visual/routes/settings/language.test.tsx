import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { Language } from '@/routes/settings/appearance/editor/$language';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager, SettingsPanelManagerContext } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../../commands';

import { THEMES } from '../../../sheet';

// Mounts the page of `language`, `width` wide, with `languages` listed, and waits for its heading `label`.
async function mount(
  theme: 'light' | 'dark',
  language: string,
  label: string,
  languages: Settings['appearance']['editor']['languages'],
  width: number,
) {
  await page.viewport(width, 640);
  // The preview takes the editor's colors for the brightness in the settings.
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
      editor: { ...DEFAULT_SETTINGS.appearance.editor, languages },
    },
  });
  const editor = new EditorManager();
  const settings = new SettingsPanelManager();
  const commands = new CommandManager({
    appearance: new AppearanceManager(theme, resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, theme)),
    editor,
    router: memoryRouter(),
    settings,
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <div
          className="bg-background font-sans text-foreground"
          data-brightness={theme}
          data-testid="sheet"
          style={{ width, height: 640 }}
        >
          <Language language={language} />
        </div>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <SettingsPanelManagerContext value={settings}>
            <LanguageServersContext value={new LanguageServers(editor)}>
              <RouterProvider router={router} />
            </LanguageServersContext>
          </SettingsPanelManagerContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByRole('heading', { name: label })).toBeVisible();
}

test.each(THEMES)('language overridden row (%s)', async (theme) => {
  // Wide enough for the preview's longest line.
  await mount(theme, 'Rust', 'Rust', { Rust: { tabSize: 2 } }, 1700);
  await expect.element(page.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  // The language loads after the first paint, and the preview fits its sample once the fonts are in.
  await vi.waitFor(() => {
    if (document.querySelector('.cm-line span') === null) {
      throw new Error('not highlighted');
    }
  });
  await document.fonts.ready;
  const width = () => document.querySelector('.cm-editor')?.closest<HTMLElement>('.dv-view')?.offsetWidth;
  for (let last = width(); ; ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const next = width();
    if (next === last) {
      break;
    }
    last = next;
  }

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`language-${theme}`);
});

test.each(THEMES)('language missing preview (%s)', async (theme) => {
  await mount(theme, 'Elm', 'Elm', { Elm: {} }, 1200);
  await expect.element(page.getByText('No preview for this language.')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`language-none-${theme}`);
});
