import { DEFAULT_SETTINGS, type ThemeId } from '@elsewise/bridge';
import { type ActiveTheme, Theme } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import dracula from '@/appearance/bundled/dracula.json';
import { resolveActiveTheme, useActiveTheme, userThemesQuery } from '@/appearance/themes';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';

const DRACULA: ThemeId = { source: 'elsewise', id: 'dracula' };

const MISSING: ThemeId = { source: 'plugin', plugin: 'io.missing', id: 'dusk' };

describe('useActiveTheme', () => {
  test('follows interface theme for missing editor and terminal themes', async () => {
    const client = new QueryClient();
    client.setQueryData(userThemesQuery.queryKey, []);
    client.setQueryData(settingsQuery.queryKey, {
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'dark', theme: DRACULA },
        editor: { ...DEFAULT_SETTINGS.appearance.editor, theme: MISSING },
        terminal: { ...DEFAULT_SETTINGS.appearance.terminal, theme: MISSING },
      },
    });
    let active: ActiveTheme | undefined;
    function Probe() {
      active = useActiveTheme();
      return null;
    }
    await render(
      <QueryClientProvider client={client}>
        <PluginStoreContext value={new PluginStore()}>
          <Probe />
        </PluginStoreContext>
      </QueryClientProvider>,
    );

    const expected = resolveActiveTheme(Theme.parse(dracula), 'dark');
    expect(active?.editor).toEqual(expected.editor);
    expect(active?.terminal).toEqual(expected.terminal);
  });
});
