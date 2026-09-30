import type { ComponentProps } from 'react';
import { Fragment, useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../../src/components/select';

import { blurInitialFocus, type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

const ITEMS = { 'feat/passport': 'feat/passport' } as const;

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof SelectTrigger>>;
  forced?: readonly ForcedPseudoClass[];
};

const STATES: readonly StateSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'disabled', label: 'disabled', props: { disabled: true } },
  { key: 'invalid', label: 'aria-invalid', props: { 'aria-invalid': true } },
  { key: 'hover', label: 'hover', forced: ['hover'] },
  {
    key: 'focus-visible',
    label: 'focus-visible',
    forced: ['focus', 'focus-visible'],
  },
  {
    key: 'invalid-focus',
    label: 'aria-invalid + focus',
    props: { 'aria-invalid': true },
    forced: ['focus', 'focus-visible'],
  },
];

const SIZES: readonly { key: string; label: string; size: 'sm' | 'default' }[] = [
  { key: 'sm', label: 'sm', size: 'sm' },
  { key: 'default', label: 'default', size: 'default' },
];

const CONTENTS: readonly { key: string; label: string; value?: string }[] = [
  { key: 'placeholder', label: 'placeholder' },
  { key: 'value', label: 'selected value', value: 'feat/passport' },
];

for (const content of CONTENTS) {
  test.each(THEMES)(`select ${content.label} (%s)`, async (theme) => {
    await render(
      <Sheet theme={theme}>
        <SelectMatrix states={STATES} value={content.value} />
      </Sheet>,
    );

    await forcePseudoStates(
      STATES.filter((state) => state.forced).map((state) => ({
        // Both size rows share a state key, so each force lands on the sm and
        // default cell together.
        selector: `[data-visual-state="${state.key}"] [data-slot="select-trigger"]`,
        pseudoClasses: state.forced ?? [],
      })),
    );

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`select-${content.key}-${theme}`);
  });
}

function SelectMatrix({ states, value }: { states: readonly StateSpec[]; value?: string }) {
  return (
    <div
      className="grid w-max items-center gap-x-5 gap-y-2"
      style={{
        gridTemplateColumns: `max-content repeat(${states.length}, max-content)`,
      }}
    >
      <div />
      {states.map((state) => (
        <div className="text-muted-foreground text-xs" key={state.key}>
          {state.label}
        </div>
      ))}
      {SIZES.map((size) => (
        <Fragment key={size.key}>
          <div className="text-muted-foreground text-xs">{size.label}</div>
          {states.map((state) => (
            // No cell padding: a field answers focus with its own border, so
            // nothing paints outside the box for a screenshot to clip.
            <div data-testid={`cell-${size.key}-${state.key}`} data-visual-state={state.key} key={state.key}>
              <Select defaultValue={value} items={ITEMS}>
                <SelectTrigger size={size.size} {...state.props}>
                  <SelectValue placeholder="Choose a branch" />
                </SelectTrigger>
              </Select>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

type RowSpec = {
  key: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  forced?: readonly ForcedPseudoClass[];
};

// Two rows carry a checkmark at once, which is why the root needs `multiple`.
const ROWS: readonly RowSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'highlighted', label: 'highlighted', forced: ['focus'] },
  { key: 'selected', label: 'selected', selected: true },
  {
    key: 'selected-highlighted',
    label: 'selected + highlighted',
    selected: true,
    forced: ['focus'],
  },
  { key: 'disabled', label: 'disabled', disabled: true, separatorBefore: true },
];

const SELECTED = ROWS.filter((row) => row.selected).map((row) => row.key);

test.each(THEMES)('select popup (%s)', async (theme) => {
  await render(<PopupSheet theme={theme} />);

  // Base UI focuses the last selected item on open, lighting a row this sheet
  // did not choose. Blurring hands every highlight to CDP.
  await blurInitialFocus();

  await forcePseudoStates(
    ROWS.filter((row) => row.forced).map((row) => ({
      selector: `[data-visual-state="${row.key}"]`,
      pseudoClasses: row.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`select-popup-${theme}`);
});

function PopupSheet({ theme }: { theme: 'light' | 'dark' }) {
  // Plain block, never the grid — see tooltip.test.tsx: a portal *appends* to
  // its container, so a grid would lay the popup out as an item.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className="h-64 w-60">
          <Select defaultOpen defaultValue={SELECTED} multiple>
            <SelectTrigger>
              <SelectValue placeholder="Choose a branch" />
            </SelectTrigger>
            {/* Aligned mode measures the viewport; off keeps the baseline byte-exact. */}
            <SelectContent container={container} side="bottom">
              <SelectGroup>
                <SelectLabel>Branches</SelectLabel>
                {ROWS.map((row) => (
                  <Fragment key={row.key}>
                    {row.separatorBefore && <SelectSeparator />}
                    <SelectItem data-visual-state={row.key} disabled={row.disabled} value={row.key}>
                      {row.label}
                    </SelectItem>
                  </Fragment>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Sheet>
  );
}

const BRANCHES = [
  'main',
  'develop',
  'release/2026.7',
  'feat/passport',
  'feat/worktrees',
  'fix/commit-panel',
  'chore/deps',
  'spike/webrtc',
] as const;

// Visibility is only `up = scrollTop > 0` / `down = scrollTop < maxScrollTop`,
// so the bottom of the list is `top` mirrored and earns no baseline.
const POSITIONS: readonly (readonly [key: string, ratio: number])[] = [
  ['top', 0],
  ['middle', 0.5],
];

const SCROLL_CASES = THEMES.flatMap((theme) => POSITIONS.map(([key, ratio]) => [theme, key, ratio] as const));

// Arrows exist only in aligned mode: off (the default), the list has no
// `overflow-y`, so `maxScrollTop` stays 0 and neither mounts. Hence the pinned
// height and the explicit `alignItemWithTrigger`.
test.each(SCROLL_CASES)('select scroll arrows (%s, %s)', async (theme, key, ratio) => {
  await render(<ScrollSheet theme={theme} />);

  // Base UI focuses an item when the popup opens, which would light a row at
  // `top` and none at `middle` once that row has scrolled away. Blurring
  // keeps the two positions comparable; nothing refocuses on its own.
  await blurInitialFocus();

  const list = document.querySelector<HTMLElement>('[role="listbox"]');
  if (!list) {
    throw new Error('select list never mounted');
  }
  list.scrollTop = Math.round((list.scrollHeight - list.clientHeight) * ratio);

  // `onScroll` is what tells the root to recompute visibility, and the
  // browser fires it on the frame after the assignment, not synchronously.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`select-scroll-arrows-${theme}-${key}`);
});

function ScrollSheet({ theme }: { theme: 'light' | 'dark' }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* Sized to the popup alone — aligned mode lays it over the trigger. */}
        <div className="h-44 w-60">
          <Select defaultOpen>
            <SelectTrigger>
              <SelectValue placeholder="Choose a branch" />
            </SelectTrigger>
            {/* `!` outranks the inline `height: 100%` aligned mode sets. */}
            <SelectContent alignItemWithTrigger className="max-h-40!" container={container}>
              {BRANCHES.map((branch) => (
                <SelectItem key={branch} value={branch}>
                  {branch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Sheet>
  );
}

const WIDTH_ITEMS = {
  main: 'main',
  'release/2026.7': 'release/2026.7',
  'fix/commit-panel': 'fix/commit-panel',
} as const;

const WIDTH_MODES: readonly { key: string; label: string; autoWidth: boolean }[] = [
  { key: 'auto', label: 'autoWidth', autoWidth: true },
  { key: 'fit', label: 'default', autoWidth: false },
];

test.each(THEMES)('select auto width (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex w-max gap-8">
        {WIDTH_MODES.map((mode) => (
          // `items-start`: stretched children would take the column width and hide the very difference being shot.
          <div className="flex flex-col items-start gap-2" key={mode.key}>
            <div className="text-muted-foreground text-xs">{mode.label}</div>
            {Object.keys(WIDTH_ITEMS).map((value) => (
              <Select defaultValue={value} items={WIDTH_ITEMS} key={value}>
                <SelectTrigger autoWidth={mode.autoWidth}>
                  <SelectValue />
                </SelectTrigger>
              </Select>
            ))}
          </div>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`select-auto-width-${theme}`);
});

const LONG_VALUE = 'feat/passport-worktree-commit-panel';

test.each(THEMES)('select long value (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex flex-col gap-2">
        {SIZES.map((size) => (
          <Select defaultValue={LONG_VALUE} items={{ [LONG_VALUE]: LONG_VALUE }} key={size.key}>
            <SelectTrigger className="w-40" size={size.size}>
              <SelectValue />
            </SelectTrigger>
          </Select>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`select-long-value-${theme}`);
});
