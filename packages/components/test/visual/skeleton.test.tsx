import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Skeleton } from '../../src/components/skeleton';

import { Sheet, THEMES } from '../sheet.tsx';

// Grounds, not states — a skeleton has no states. What decides whether it works is what it sits on, because
// `bg-muted` resolves to `--surface-2`: the same token as one of the surfaces it is meant to be placed on.
//
// That makes the sheet an argument rather than a record. Against the page, vellum on white is ~1.02:1; against a
// `surface-2` well it is the *same colour* and disappears completely. Dark fares better — pool on the night page has
// real separation. The rows are ordered worst-to-best so the light baseline reads as the problem statement it is.
//
// `animate-pulse` is neutralised by `visual.css` (`animation: none`), so every capture is the element at its base
// opacity rather than a frame of the cycle. That is what makes this byte-comparable at all — and it means the baseline
// says nothing about the pulse, which DESIGN.md does not mention either way.
const GROUNDS = [
  { key: 'surface-2', label: 'on surface-2 (well)', className: 'bg-surface-2' },
  {
    key: 'background',
    label: 'on background (page)',
    className: 'bg-background',
  },
  { key: 'surface', label: 'on surface (pane)', className: 'bg-surface' },
] as const;

test.each(THEMES)('skeleton grounds (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-6 gap-y-3">
        {GROUNDS.map((ground) => (
          <Fragment key={ground.key}>
            <div className="text-muted-foreground text-xs">{ground.label}</div>
            <div
              className={`flex w-72 items-center gap-3 rounded-lg p-4 ${ground.className}`}
              data-testid={`cell-${ground.key}`}
            >
              {/* A realistic cluster — the shapes a row placeholder uses. */}
              <Skeleton className="size-10 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`skeleton-${theme}`);
});
