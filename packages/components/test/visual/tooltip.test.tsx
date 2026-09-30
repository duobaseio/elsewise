import { useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../src/components/tooltip';

import { Sheet, THEMES } from '../sheet.tsx';

// Sides, not states — a tooltip is never focusable and carries no hover,
// active or disabled rules, so only its placement varies.
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

test.each(THEMES)('tooltip sides (%s)', async (theme) => {
  await render(<TooltipSheet theme={theme} />);

  // Base UI keeps one tooltip open per group. A closed popup can still paint, so the count is asserted rather than
  // trusted to the baseline.
  await expect
    .poll(() => page.getByTestId('sheet').element().querySelectorAll('[data-slot="tooltip-content"][data-open]').length)
    .toBe(SIDES.length);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`tooltip-${theme}`);
});

function TooltipSheet({ theme }: { theme: 'light' | 'dark' }) {
  // The portal must land inside the sheet (for the local `.dark` and the
  // captured bounding box) and on a plain block — a portal *appends* to its
  // container, so the grid would lay popups out as items.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <TooltipProvider>
        <div ref={setContainer}>
          <div className="grid grid-cols-2">
            {SIDES.map((side) => (
              // The popup is out of flow, so each cell must reserve the room
              // its tooltip needs — too small does not reflow, it crops.
              <div className="flex h-32 w-[22rem] items-center justify-center" key={side}>
                <Tooltip open>
                  <TooltipTrigger
                    className="rounded-lg border border-border px-2.5 py-1 text-base"
                    data-testid={`trigger-${side}`}
                  >
                    {side}
                  </TooltipTrigger>
                  <TooltipContent container={container} side={side}>
                    New worktree
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      </TooltipProvider>
    </Sheet>
  );
}
