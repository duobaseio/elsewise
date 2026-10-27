import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { HighlightProvider } from '@elsewise/components/components/settings';
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
import { Editor } from '@/routes/settings/appearance/editor';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager, SettingsPanelManagerContext } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../../commands';

import { THEMES } from '../../../sheet';

test.each(THEMES)('editor (%s)', async (theme) => {
  // Wide enough for the preview's longest line, and tall enough for every row.
  await page.viewport(1700, 1140);
  // The preview takes the editor's colors for the brightness in the settings.
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
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
          style={{ width: 1700, height: 1140 }}
        >
          <HighlightProvider id="theme">
            <Editor />
          </HighlightProvider>
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
  await expect.element(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
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

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-${theme}`);
});
