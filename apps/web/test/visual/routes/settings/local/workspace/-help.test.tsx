import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { UniqueTabNamesHelp, TabTooltipsHelp } from '@/routes/settings/local/workspace/-help';

import { THEMES } from '../../../../../sheet';

const HELPS: Record<string, ReactNode> = {
  'unique-tab-names-help': <UniqueTabNamesHelp enabled />,
  'unique-tab-names-help-disabled': <UniqueTabNamesHelp enabled={false} />,
  'tab-tooltips-help': <TabTooltipsHelp enabled />,
  'tab-tooltips-help-disabled': <TabTooltipsHelp enabled={false} />,
};

test.each(Object.keys(HELPS).flatMap((name) => THEMES.map((theme) => [name, theme] as const)))(
  '%s (%s)',
  async (name, theme) => {
    await render(
      <div
        className="flex w-fit flex-col gap-4 bg-background p-3 font-sans text-sm text-popover-foreground *:overflow-hidden *:rounded-md *:bg-popover *:ring-1 *:ring-foreground/10"
        data-brightness={theme}
        data-testid="sheet"
      >
        <div>{HELPS[name]}</div>
      </div>,
    );
    await expect.element(page.getByTestId('sheet')).toBeVisible();

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`${name}-${theme}`);
  },
);
