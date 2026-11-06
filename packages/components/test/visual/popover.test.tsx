import { useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from '../../src/components/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../../src/components/popover';
import { cn } from '../../src/lib/utils';
import { Sheet, THEMES } from '../sheet';

// Contents and alignments, not states. A popover carries no hover, active or disabled rules of its own.
const PARTS = [
  { key: 'header', label: 'title and description', align: 'start', header: true },
  { key: 'plain', label: 'plain text', align: 'end', header: false },
] as const;

test.each(THEMES)('popover parts (%s)', async (theme) => {
  await render(<PartsSheet theme={theme} />);

  await expect
    .poll(() => page.getByTestId('sheet').element().querySelectorAll('[data-slot="popover-content"][data-open]').length)
    .toBe(PARTS.length);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`popover-${theme}`);
});

function PartsSheet({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <Sheet theme={theme}>
      <div className="grid grid-cols-2 gap-6">
        {PARTS.map((part) => (
          <div className="flex flex-col gap-2" key={part.key}>
            <div className="text-muted-foreground text-xs">{part.label}</div>
            <PartsCell align={part.align} header={part.header} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function PartsCell({ align, header }: { align: 'start' | 'end'; header: boolean }) {
  // Each cell hosts its own portal, so the popups stay in grid order and inside the captured sheet. The popup is out
  // of flow, so the cell reserves the room it needs.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <div
      className={cn('relative flex h-36 w-[20rem] flex-col', align === 'start' ? 'items-start' : 'items-end')}
      ref={setContainer}
    >
      <Popover open>
        <PopoverTrigger render={<Button variant="outline" />}>Worktree</PopoverTrigger>
        <PopoverContent align={align} container={container} initialFocus={false}>
          {header ? (
            <PopoverHeader>
              <PopoverTitle>Remove worktree</PopoverTitle>
              <PopoverDescription>reykjavik has uncommitted changes.</PopoverDescription>
            </PopoverHeader>
          ) : (
            'reykjavik has uncommitted changes.'
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
