import type { ComponentProps } from 'react';
import { Fragment, useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
  AutocompleteSeparator,
} from '../../src/components/autocomplete';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof AutocompleteInput>>;
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

const CONTENTS: readonly { key: string; label: string; value?: string }[] = [
  { key: 'placeholder', label: 'placeholder' },
  { key: 'value', label: 'value', value: 'src/lib/' },
];

for (const content of CONTENTS) {
  test.each(THEMES)(`autocomplete ${content.label} (%s)`, async (theme) => {
    await render(
      <Sheet theme={theme}>
        <InputMatrix states={STATES} value={content.value} />
      </Sheet>,
    );

    await forcePseudoStates(
      STATES.filter((state) => state.forced).map((state) => ({
        selector: `[data-visual-state="${state.key}"] [data-slot="autocomplete-input"]`,
        pseudoClasses: state.forced ?? [],
      })),
    );

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`autocomplete-${content.key}-${theme}`);
  });
}

function InputMatrix({ states, value }: { states: readonly StateSpec[]; value?: string }) {
  return (
    <div
      className="grid w-max items-center gap-x-5 gap-y-2"
      style={{
        gridTemplateColumns: `repeat(${states.length}, max-content)`,
      }}
    >
      {states.map((state) => (
        <div className="text-muted-foreground text-xs" key={state.key}>
          {state.label}
        </div>
      ))}
      {states.map((state) => (
        <div className="w-40" data-testid={`cell-${state.key}`} data-visual-state={state.key} key={state.key}>
          <Autocomplete defaultValue={value}>
            <AutocompleteInput placeholder="Workspace root" {...state.props} />
          </Autocomplete>
        </div>
      ))}
    </div>
  );
}

type RowSpec = {
  key: string;
  label: string;
  highlighted?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

// Highlight is a data attribute driven by Base UI's store rather than a pseudo-class, so it cannot be forced through
// CDP; a passed `data-highlighted` outranks the store's.
const ROWS: readonly RowSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'highlighted', label: 'highlighted', highlighted: true },
  { key: 'disabled', label: 'disabled', disabled: true, separatorBefore: true },
];

test.each(THEMES)('autocomplete popup (%s)', async (theme) => {
  await render(<PopupSheet theme={theme} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`autocomplete-popup-${theme}`);
});

function PopupSheet({ theme }: { theme: 'light' | 'dark' }) {
  // Plain block, never the grid — see tooltip.test.tsx: a portal *appends* to
  // its container, so a grid would lay the popup out as an item.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        {/* The positioned popup cannot stretch the sheet; this reserves its room. */}
        <div className="h-48 w-60">
          <Autocomplete defaultOpen>
            <AutocompleteInput placeholder="Workspace root" />
            <AutocompleteContent container={container} side="bottom">
              <AutocompleteList>
                <AutocompleteGroup>
                  <AutocompleteLabel>Folders</AutocompleteLabel>
                  {ROWS.map((row) => (
                    <Fragment key={row.key}>
                      {row.separatorBefore && <AutocompleteSeparator />}
                      <AutocompleteItem
                        data-highlighted={row.highlighted ? '' : undefined}
                        data-visual-state={row.key}
                        disabled={row.disabled}
                        value={row.key}
                      >
                        {row.label}
                      </AutocompleteItem>
                    </Fragment>
                  ))}
                </AutocompleteGroup>
              </AutocompleteList>
            </AutocompleteContent>
          </Autocomplete>
        </div>
      </div>
    </Sheet>
  );
}

const FOLDERS = ['docs/', 'src/', 'src/lib/', 'test/'] as const;

const QUERIES: readonly { key: string; label: string; query: string }[] = [
  { key: 'filtered', label: 'filtered', query: 'src' },
  { key: 'empty', label: 'no match', query: 'zzz' },
];

const QUERY_CASES = THEMES.flatMap((theme) => QUERIES.map((query) => [theme, query] as const));

test.each(QUERY_CASES)('autocomplete search (%s, %s)', async (theme, query) => {
  await render(<SearchSheet query={query.query} theme={theme} />);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`autocomplete-search-${query.key}-${theme}`);
});

function SearchSheet({ query, theme }: { query: string; theme: 'light' | 'dark' }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Sheet theme={theme}>
      <div ref={setContainer}>
        <div className="h-40 w-60">
          <Autocomplete defaultOpen defaultValue={query} items={FOLDERS}>
            <AutocompleteInput placeholder="Workspace root" />
            <AutocompleteContent container={container} side="bottom">
              <AutocompleteEmpty>No folders found</AutocompleteEmpty>
              <AutocompleteList>
                {(folder: string) => <AutocompleteItem value={folder}>{folder}</AutocompleteItem>}
              </AutocompleteList>
            </AutocompleteContent>
          </Autocomplete>
        </div>
      </div>
    </Sheet>
  );
}
