import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { GitStatusBadgesHelp, HiddenHelp, IndentGuidesHelp } from '@/routes/settings/local/file-tree/-help';

import { THEMES } from '../../../../../sheet';

const HELPS: Record<string, ReactNode> = {
  'git-status-badges-help': <GitStatusBadgesHelp enabled>Requires a git repository.</GitStatusBadgesHelp>,
  'git-status-badges-help-disabled': (
    <GitStatusBadgesHelp enabled={false}>Requires a git repository.</GitStatusBadgesHelp>
  ),
  'indent-guides-help': <IndentGuidesHelp enabled />,
  'indent-guides-help-disabled': <IndentGuidesHelp enabled={false} />,
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
    // Waits for every row and the icons they draw, so the screenshot has no blank icon lanes.
    const tree = await vi.waitFor(() => {
      const root = document.querySelector('file-tree-container')?.shadowRoot;
      if (root?.querySelectorAll('[data-type="item"]').length !== 6) {
        throw new Error('The file tree has not rendered every row.');
      }
      return root;
    });
    const icons = [...tree.querySelectorAll('image')].flatMap((image) => image.getAttribute('href') ?? []);
    await Promise.all(icons.map((url) => fetch(url)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`${name}-${theme}`);
  },
);

test.each(THEMES)('hidden-help (%s)', async (theme) => {
  await render(
    <div
      className="flex w-fit flex-col gap-4 bg-background p-3 font-sans text-sm text-popover-foreground *:overflow-hidden *:rounded-md *:bg-popover *:ring-1 *:ring-foreground/10"
      data-brightness={theme}
      data-testid="sheet"
    >
      <div>
        <HiddenHelp />
      </div>
    </div>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`hidden-help-${theme}`);
});
