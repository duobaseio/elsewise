import { Fragment, useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../src/components/context-menu';

import { blurInitialFocus, type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type RowSpec = {
  key: string;
  label: string;
  shortcut?: string;
  variant?: 'destructive';
  disabled?: boolean;
  separatorBefore?: boolean;
  forced?: readonly ForcedPseudoClass[];
};

const ROWS: readonly RowSpec[] = [
  { key: 'rest', label: 'rest', shortcut: '⌘R' },
  { key: 'highlighted', label: 'highlighted', forced: ['focus'] },
  { key: 'disabled', label: 'disabled', disabled: true },
  {
    key: 'destructive',
    label: 'destructive',
    separatorBefore: true,
    variant: 'destructive',
  },
  {
    key: 'destructive-highlighted',
    label: 'destructive + highlighted',
    variant: 'destructive',
    forced: ['focus'],
  },
];

// The check rows sit outside ROWS: they carry an indicator instead of a
// shortcut, and each has its own primitive.
const CHECKED = [
  { key: 'checkbox', label: 'checkbox item' },
  { key: 'radio', label: 'radio item' },
] as const;

test.each(THEMES)('context menu (%s)', async (theme) => {
  await render(<MenuSheet theme={theme} />);

  // Right-clicking with a real pointer would leave the menu anchored to wherever
  // the pointer landed; a dispatched event pins it to the coordinates below.
  const trigger = document.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
  if (!trigger) {
    throw new Error('context menu trigger never mounted');
  }
  trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Base UI highlights the first item on open, which would collide with the row
  // this sheet forces. Blurring hands every highlight to CDP.
  await blurInitialFocus();

  await forcePseudoStates(
    ROWS.filter((row) => row.forced).map((row) => ({
      selector: `[data-visual-state="${row.key}"]`,
      pseudoClasses: row.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`context-menu-${theme}`);
});

function MenuSheet({ theme }: { theme: 'light' | 'dark' }) {
  // Plain block, never a grid — a portal *appends* to its container, so a grid
  // would lay the popup out as an item.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className="h-72 w-64">
          <ContextMenu>
            <ContextMenuTrigger className="size-4" />
            <ContextMenuContent container={container}>
              <ContextMenuGroup>
                <ContextMenuLabel>Worktree</ContextMenuLabel>
                {ROWS.map((row) => (
                  <Fragment key={row.key}>
                    {row.separatorBefore && <ContextMenuSeparator />}
                    <ContextMenuItem data-visual-state={row.key} disabled={row.disabled} variant={row.variant}>
                      {row.label}
                      {row.shortcut && <ContextMenuShortcut>{row.shortcut}</ContextMenuShortcut>}
                    </ContextMenuItem>
                  </Fragment>
                ))}
              </ContextMenuGroup>
              <ContextMenuSeparator />
              <ContextMenuCheckboxItem checked>{CHECKED[0].label}</ContextMenuCheckboxItem>
              <ContextMenuRadioGroup value={CHECKED[1].key}>
                <ContextMenuRadioItem value={CHECKED[1].key}>{CHECKED[1].label}</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
              {/* Closed: the trigger row is what carries the type size, and an
                  open submenu would land outside the reserved room. */}
              <ContextMenuSub>
                <ContextMenuSubTrigger>sub trigger</ContextMenuSubTrigger>
                <ContextMenuSubContent container={container}>
                  <ContextMenuItem>nested</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
    </Sheet>
  );
}
