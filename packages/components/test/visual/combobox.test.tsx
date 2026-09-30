import type { ComponentProps } from 'react';
import { Fragment, useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from '../../src/components/combobox';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

const ITEMS = ['feat/passport'] as const;

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof ComboboxTrigger>>;
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
  test.each(THEMES)(`combobox ${content.label} (%s)`, async (theme) => {
    await render(
      <Sheet theme={theme}>
        <TriggerMatrix states={STATES} value={content.value} />
      </Sheet>,
    );

    await forcePseudoStates(
      STATES.filter((state) => state.forced).map((state) => ({
        selector: `[data-visual-state="${state.key}"] [data-slot="combobox-trigger"]`,
        pseudoClasses: state.forced ?? [],
      })),
    );

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-${content.key}-${theme}`);
  });
}

function TriggerMatrix({ states, value }: { states: readonly StateSpec[]; value?: string }) {
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
            <div data-testid={`cell-${size.key}-${state.key}`} data-visual-state={state.key} key={state.key}>
              <Combobox defaultValue={value} items={ITEMS}>
                <ComboboxTrigger size={size.size} {...state.props}>
                  <ComboboxValue placeholder="Choose a branch" />
                </ComboboxTrigger>
              </Combobox>
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
  highlighted?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

// Two rows carry a checkmark at once, which is why the root needs `multiple`. Highlight is a data attribute driven by
// Base UI's store rather than a pseudo-class, so it cannot be forced through CDP; a passed `data-highlighted` outranks
// the store's, which is how two rows light at once.
const ROWS: readonly RowSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'highlighted', label: 'highlighted', highlighted: true },
  { key: 'selected', label: 'selected', selected: true },
  {
    key: 'selected-highlighted',
    label: 'selected + highlighted',
    selected: true,
    highlighted: true,
  },
  { key: 'disabled', label: 'disabled', disabled: true, separatorBefore: true },
];

const SELECTED = ROWS.filter((row) => row.selected).map((row) => row.key);

test.each(THEMES)('combobox popup (%s)', async (theme) => {
  await render(<PopupSheet theme={theme} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-popup-${theme}`);
});

function PopupSheet({ theme }: { theme: 'light' | 'dark' }) {
  // Plain block, never the grid — see tooltip.test.tsx: a portal *appends* to
  // its container, so a grid would lay the popup out as an item.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className="h-80 w-60">
          <Combobox defaultOpen defaultValue={SELECTED} multiple>
            <ComboboxTrigger>
              <ComboboxValue placeholder="Choose a branch" />
            </ComboboxTrigger>
            <ComboboxContent container={container} side="bottom">
              <ComboboxInput placeholder="Search branches" />
              <ComboboxList>
                <ComboboxGroup>
                  <ComboboxLabel>Branches</ComboboxLabel>
                  {ROWS.map((row) => (
                    <Fragment key={row.key}>
                      {row.separatorBefore && <ComboboxSeparator />}
                      <ComboboxItem
                        data-highlighted={row.highlighted ? '' : undefined}
                        data-visual-state={row.key}
                        disabled={row.disabled}
                        value={row.key}
                      >
                        {row.label}
                      </ComboboxItem>
                    </Fragment>
                  ))}
                </ComboboxGroup>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
    </Sheet>
  );
}

const BRANCHES = ['main', 'develop', 'release/2026.7', 'feat/passport'] as const;

const QUERIES: readonly { key: string; label: string; query: string }[] = [
  { key: 'filtered', label: 'filtered', query: 'pass' },
  { key: 'empty', label: 'no match', query: 'zzz' },
];

const QUERY_CASES = THEMES.flatMap((theme) => QUERIES.map((query) => [theme, query] as const));

test.each(QUERY_CASES)('combobox search (%s, %s)', async (theme, query) => {
  await render(<SearchSheet query={query.query} theme={theme} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-search-${query.key}-${theme}`);
});

function SearchSheet({ query, theme }: { query: string; theme: 'light' | 'dark' }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        <div className="h-40 w-60">
          <Combobox defaultInputValue={query} defaultOpen items={BRANCHES}>
            <ComboboxTrigger>
              <ComboboxValue placeholder="Choose a branch" />
            </ComboboxTrigger>
            <ComboboxContent container={container} side="bottom">
              <ComboboxInput placeholder="Search branches" />
              <ComboboxEmpty>No branches found</ComboboxEmpty>
              <ComboboxList>{(branch: string) => <ComboboxItem value={branch}>{branch}</ComboboxItem>}</ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
    </Sheet>
  );
}

const WIDTH_ITEMS = ['main', 'release/2026.7', 'fix/commit-panel'] as const;

const WIDTH_MODES: readonly { key: string; label: string; autoWidth: boolean }[] = [
  { key: 'auto', label: 'autoWidth', autoWidth: true },
  { key: 'fit', label: 'default', autoWidth: false },
];

test.each(THEMES)('combobox auto width (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex w-max gap-8">
        {WIDTH_MODES.map((mode) => (
          // `items-start`: stretched children would take the column width and hide the very difference being shot.
          <div className="flex flex-col items-start gap-2" key={mode.key}>
            <div className="text-muted-foreground text-xs">{mode.label}</div>
            {WIDTH_ITEMS.map((value) => (
              <Combobox defaultValue={value} items={WIDTH_ITEMS} key={value}>
                <ComboboxTrigger autoWidth={mode.autoWidth}>
                  <ComboboxValue />
                </ComboboxTrigger>
              </Combobox>
            ))}
          </div>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-auto-width-${theme}`);
});

const LONG_VALUE = 'feat/passport-worktree-commit-panel';

test.each(THEMES)('combobox long value (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex flex-col gap-2">
        {SIZES.map((size) => (
          <Combobox defaultValue={LONG_VALUE} items={[LONG_VALUE]} key={size.key}>
            <ComboboxTrigger className="w-40" size={size.size}>
              <ComboboxValue />
            </ComboboxTrigger>
          </Combobox>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-long-value-${theme}`);
});
