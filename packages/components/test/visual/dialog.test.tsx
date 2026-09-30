import { useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Button } from '../../src/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../src/components/dialog';

import { blurInitialFocus, Sheet, THEMES } from '../sheet.tsx';

test.each(THEMES)('dialog over scrim (%s)', async (theme) => {
  await render(<ScrimSheet theme={theme} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dialog-${theme}`);
});

function ScrimSheet({ theme }: { theme: 'light' | 'dark' }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      {/* The popup is `fixed`, which would center it on the viewport rather
          than the captured sheet; a `relative` box gives it somewhere else to
          be. The backdrop stays `fixed` on purpose — it covers the sheet along
          with everything else, which is the one honest way to see the scrim at
          its real depth over real content. */}
      <div className="relative h-80 w-[28rem]" ref={setContainer}>
        <div className="flex flex-col gap-2 p-4">
          <div className="font-heading text-heading">Worktrees</div>
          {BRANCHES.map((branch) => (
            <div className="text-base" key={branch}>
              {branch}
            </div>
          ))}
        </div>
        <Dialog open>
          <DialogContent className="absolute" container={container}>
            <DialogHeader>
              <DialogTitle>Remove worktree</DialogTitle>
              <DialogDescription>reykjavik has uncommitted changes. Removing it discards them.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <DialogClose render={<Button variant="destructive" />}>Remove</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Sheet>
  );
}

const BRANCHES = ['main', 'feat/passport', 'reykjavik', 'spike/webrtc'] as const;

type PartsSpec = {
  key: string;
  label: string;
  props?: Partial<React.ComponentProps<typeof DialogContent>>;
  footer?: boolean;
  title?: string;
};

const PARTS: readonly PartsSpec[] = [
  { key: 'header-only', label: 'header only' },
  { key: 'footer', label: 'with footer', footer: true },
  {
    key: 'no-close',
    label: 'no close button',
    props: { showCloseButton: false },
  },
  {
    key: 'long-title',
    label: 'title into the close button',
    title: 'Remove worktree and delete its branch',
  },
];

test.each(THEMES)('dialog parts (%s)', async (theme) => {
  await render(<PartsSheet theme={theme} />);

  // A dialog focuses on open, and with four of them the mark lands on whichever
  // mounted last. The scrim sheet keeps its focus — one dialog, so it is the
  // real initial-focus target rather than an arbitrary winner.
  await blurInitialFocus();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dialog-parts-${theme}`);
});

function PartsSheet({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <Sheet theme={theme}>
      <div className="grid grid-cols-2 gap-6">
        {PARTS.map((part) => (
          <div className="flex flex-col gap-2" key={part.key}>
            <div className="text-muted-foreground text-xs">{part.label}</div>
            {/* Each cell hosts its own portal, so the popups stay in grid order
                instead of stacking at the end of a shared container. */}
            <PartsCell footer={part.footer} props={part.props} title={part.title} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function PartsCell({ footer, props, title }: Omit<PartsSpec, 'key' | 'label'>) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    // Four dialogs means four backdrops, and stacked they take the sheet to
    // near-black. The scrim gets its own sheet; here only the surface matters.
    <div className="relative h-56 w-[22rem] [&_[data-slot=dialog-overlay]]:hidden" ref={setContainer}>
      <Dialog open>
        <DialogContent className="absolute" container={container} {...props}>
          <DialogHeader>
            <DialogTitle>{title ?? 'Remove worktree'}</DialogTitle>
            <DialogDescription>reykjavik has uncommitted changes.</DialogDescription>
          </DialogHeader>
          {footer && (
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <DialogClose render={<Button variant="destructive" />}>Remove</DialogClose>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
