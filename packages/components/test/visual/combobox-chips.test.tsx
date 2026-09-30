import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from '../../src/components/combobox';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

const ITEMS = ['80', '100', '120'] as const;

type StateSpec = {
  key: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  forced?: readonly ForcedPseudoClass[];
};

const STATES: readonly StateSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'disabled', label: 'disabled', disabled: true },
  { key: 'invalid', label: 'aria-invalid', invalid: true },
  { key: 'focus-within', label: 'focus-within', forced: ['focus-within'] },
];

const SIZES: readonly { key: string; label: string; size: 'sm' | 'default' }[] = [
  { key: 'sm', label: 'sm', size: 'sm' },
  { key: 'default', label: 'default', size: 'default' },
];

const CONTENTS: readonly { key: string; label: string; value: readonly string[] }[] = [
  { key: 'empty', label: 'placeholder', value: [] },
  { key: 'chips', label: 'chips', value: ['80', '120'] },
];

for (const content of CONTENTS) {
  test.each(THEMES)(`combobox chips ${content.label} (%s)`, async (theme) => {
    await render(
      <Sheet theme={theme}>
        <div
          className="grid w-max items-center gap-x-5 gap-y-2"
          style={{ gridTemplateColumns: `max-content repeat(${STATES.length}, max-content)` }}
        >
          <div />
          {STATES.map((state) => (
            <div className="text-muted-foreground text-xs" key={state.key}>
              {state.label}
            </div>
          ))}
          {SIZES.map((size) => (
            <Fragment key={size.key}>
              <div className="text-muted-foreground text-xs">{size.label}</div>
              {STATES.map((state) => (
                <div className="w-48" data-visual-state={state.key} key={state.key}>
                  <Combobox defaultValue={[...content.value]} disabled={state.disabled} items={ITEMS} multiple>
                    <ComboboxChips size={size.size}>
                      <ComboboxValue>
                        {(value: string[]) => value.map((column) => <ComboboxChip key={column}>{column}</ComboboxChip>)}
                      </ComboboxValue>
                      <ComboboxChipsInput aria-invalid={state.invalid} placeholder="Add column" />
                    </ComboboxChips>
                  </Combobox>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </Sheet>,
    );

    await forcePseudoStates(
      STATES.filter((state) => state.forced).map((state) => ({
        selector: `[data-visual-state="${state.key}"] [data-slot="combobox-chips"]`,
        pseudoClasses: state.forced ?? [],
      })),
    );

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`combobox-chips-${content.key}-${theme}`);
  });
}
