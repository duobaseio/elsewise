import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Separator } from '../../src/components/separator';

import { Sheet, THEMES } from '../sheet.tsx';

// Orientations, not states — a separator is decorative, takes no focus and carries no interactive rules. What there is
// to pin is that the deckle hairline is exactly 1px on the right axis, and that it is *faint by design*: `--border`
// against the page is ~1.2:1, so a baseline is the only practical guard against it going missing entirely.
// DESIGN.md:66 tracks that contrast question separately, for borders that carry meaning rather than divide.
//
// The vertical cell sits in a flex row deliberately. `data-vertical:self-stretch` is an `align-self`, which does
// nothing outside a flex or grid container — a vertical separator in a block context computes to 0 height and paints
// nothing. That is the footgun worth knowing; it is not screenshotted here because a cell containing nothing
// documents nothing.
test.each(THEMES)('separator orientations (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max gap-6">
        <div className="grid w-64 gap-2">
          <div className="text-muted-foreground text-xs">horizontal</div>
          <span>Above</span>
          <Separator />
          <span>Below</span>
        </div>
        <div className="grid gap-2">
          <div className="text-muted-foreground text-xs">vertical</div>
          <div className="flex h-8 items-center gap-3">
            <span>Left</span>
            <Separator orientation="vertical" />
            <span>Right</span>
          </div>
        </div>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`separator-${theme}`);
});
