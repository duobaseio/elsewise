import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import {
  CompletionDocumentationHelp,
  HighlightUsagesHelp,
  ScrollbarMarkersHelp,
} from '@/routes/settings/appearance/editor/-help';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../../sheet';

test.each(THEMES)('editor help (%s)', async (theme) => {
  // The illustrations take the editor's colors for the brightness in the settings.
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <div
        className="flex w-fit flex-col gap-4 bg-background p-3 font-sans text-sm text-popover-foreground *:overflow-hidden *:rounded-md *:bg-popover *:ring-1 *:ring-foreground/10"
        data-brightness={theme}
        data-testid="sheet"
      >
        <div>
          <CompletionDocumentationHelp>Documentation may require a language server.</CompletionDocumentationHelp>
        </div>
        <div>
          <HighlightUsagesHelp>Requires a language server.</HighlightUsagesHelp>
        </div>
        <div>
          <ScrollbarMarkersHelp>Diagnostics may require a language server.</ScrollbarMarkersHelp>
        </div>
      </div>
    </QueryClientProvider>,
  );
  await expect.element(page.getByText('Returns an iterator over the slice.')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-help-${theme}`);
});
