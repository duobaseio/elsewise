import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { GitStatusBadgesHelp } from '@/routes/settings/local/appearance/general/-help';

import { THEMES } from '../../../../../../sheet';

test.each(THEMES)('general help (%s)', async (theme) => {
  await render(
    <div
      className="flex w-fit flex-col gap-4 bg-background p-3 font-sans text-sm text-popover-foreground *:overflow-hidden *:rounded-md *:bg-popover *:ring-1 *:ring-foreground/10"
      data-brightness={theme}
      data-testid="sheet"
    >
      <div>
        <GitStatusBadgesHelp>Requires a git repository.</GitStatusBadgesHelp>
      </div>
    </div>,
  );
  // Waits for every row and the icons they draw, so the screenshot has no blank icon lanes.
  const tree = await vi.waitFor(() => {
    const root = document.querySelector('file-tree-container')?.shadowRoot;
    if (root?.querySelectorAll('[data-type="item"]').length !== 7) {
      throw new Error('The file tree has not rendered every row.');
    }
    return root;
  });
  const icons = [...tree.querySelectorAll('image')].flatMap((image) => image.getAttribute('href') ?? []);
  await Promise.all(icons.map((url) => fetch(url)));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`general-help-${theme}`);
});
