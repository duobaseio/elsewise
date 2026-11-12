import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import {
  CompletionDocumentationHelp,
  HighlightUsagesHelp,
  ScrollbarMarkersHelp,
} from '@/routes/settings/local/editor/-help';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../../../sheet';

const HELPS: Record<string, (enabled: boolean) => ReactNode> = {
  'completion-documentation-help': (enabled) => (
    <CompletionDocumentationHelp enabled={enabled}>
      Documentation may require a language server.
    </CompletionDocumentationHelp>
  ),
  'highlight-usages-help': (enabled) => (
    <HighlightUsagesHelp enabled={enabled}>Requires a language server.</HighlightUsagesHelp>
  ),
  'scrollbar-markers-help': (enabled) => (
    <ScrollbarMarkersHelp enabled={enabled}>Diagnostics may require a language server.</ScrollbarMarkersHelp>
  ),
};

test.each(
  Object.keys(HELPS).flatMap((name) =>
    [true, false].flatMap((enabled) => THEMES.map((theme) => [name, enabled, theme] as const)),
  ),
)('%s enabled %s (%s)', async (name, enabled, theme) => {
  // The illustrations take the editor's colors for the brightness in the settings.
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_FRONTEND_SETTINGS,
    appearance: { ...DEFAULT_FRONTEND_SETTINGS.appearance, brightness: theme },
  });
  await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <div
          className="flex w-fit flex-col gap-4 bg-background p-3 font-sans text-sm text-popover-foreground *:overflow-hidden *:rounded-md *:bg-popover *:ring-1 *:ring-foreground/10"
          data-brightness={theme}
          data-testid="sheet"
        >
          <div>{HELPS[name]?.(enabled)}</div>
        </div>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  await expect.element(page.getByText(/language server/)).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`${name}${enabled ? '' : '-disabled'}-${theme}`);
});
