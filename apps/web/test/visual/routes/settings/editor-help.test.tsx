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
        className="flex w-fit flex-col gap-4 rounded-md bg-popover px-3 py-3 font-sans text-sm text-popover-foreground"
        data-brightness={theme}
        data-testid="sheet"
      >
        <CompletionDocumentationHelp>Documentation may require a language server.</CompletionDocumentationHelp>
        <HighlightUsagesHelp>Requires a language server.</HighlightUsagesHelp>
        <ScrollbarMarkersHelp>Diagnostics may require a language server.</ScrollbarMarkersHelp>
      </div>
    </QueryClientProvider>,
  );
  await expect.element(page.getByText('Returns an iterator over the slice.')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-help-${theme}`);
});
