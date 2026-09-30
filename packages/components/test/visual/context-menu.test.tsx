import { Fragment, useState } from 'react';
import { expect, test, vi } from 'vitest';
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
  await openMenu();

  await blurInitialFocus();

  await forcePseudoStates(
    ROWS.filter((row) => row.forced).map((row) => ({
      selector: `[data-visual-state="${row.key}"]`,
      pseudoClasses: row.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`context-menu-${theme}`);
});

test.each(THEMES)('context menu open submenu (%s)', async (theme) => {
  await render(<MenuSheet subOpen theme={theme} />);
  await openMenu();
  await vi.waitFor(() => {
    if (!document.querySelector('[data-slot="context-menu-sub-trigger"][data-popup-open]')) {
      throw new Error('submenu never opened');
    }
  });
  await blurInitialFocus();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`context-menu-submenu-${theme}`);
});

async function openMenu() {
  const trigger = document.querySelector<HTMLElement>('[data-slot="context-menu-trigger"]');
  if (!trigger) {
    throw new Error('context menu trigger never mounted');
  }
  trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function MenuSheet({ theme, subOpen = false }: { theme: 'light' | 'dark'; subOpen?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className={subOpen ? 'h-80 w-[36rem]' : 'h-72 w-64'}>
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
              <ContextMenuSub defaultOpen={subOpen}>
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
