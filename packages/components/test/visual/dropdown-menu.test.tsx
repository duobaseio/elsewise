import { DotsThreeIcon } from '@phosphor-icons/react';
import { Fragment, useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Button } from '../../src/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../src/components/dropdown-menu';

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

test.each(THEMES)('dropdown menu (%s)', async (theme) => {
  await render(<MenuSheet theme={theme} />);

  // Base UI highlights the first item on open, which would collide with the row
  // this sheet forces. Blurring hands every highlight to CDP.
  await blurInitialFocus();

  await forcePseudoStates(
    ROWS.filter((row) => row.forced).map((row) => ({
      selector: `[data-visual-state="${row.key}"]`,
      pseudoClasses: row.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dropdown-menu-${theme}`);
});

function MenuSheet({ theme }: { theme: 'light' | 'dark' }) {
  // Plain block, never a grid — a portal *appends* to its container, so a grid
  // would lay the popup out as an item.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className="h-96 w-64">
          <DropdownMenu defaultOpen>
            {/* An icon-sized trigger on purpose: the menu sizes to its own
                longest row, so a narrow trigger must not squeeze it. */}
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" />}>
              <DotsThreeIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent container={container}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Worktree</DropdownMenuLabel>
                {ROWS.map((row) => (
                  <Fragment key={row.key}>
                    {row.separatorBefore && <DropdownMenuSeparator />}
                    <DropdownMenuItem data-visual-state={row.key} disabled={row.disabled} variant={row.variant}>
                      {row.label}
                      {row.shortcut && <DropdownMenuShortcut>{row.shortcut}</DropdownMenuShortcut>}
                    </DropdownMenuItem>
                  </Fragment>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>{CHECKED[0].label}</DropdownMenuCheckboxItem>
              <DropdownMenuRadioGroup value={CHECKED[1].key}>
                <DropdownMenuRadioItem value={CHECKED[1].key}>{CHECKED[1].label}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {/* Closed: the trigger row is what carries the type size, and an
                  open submenu would land outside the reserved room. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>sub trigger</DropdownMenuSubTrigger>
                <DropdownMenuSubContent container={container}>
                  <DropdownMenuItem>nested</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Sheet>
  );
}
