import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { RadioGroup, RadioGroupItem } from '../../src/components/radio-group';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof RadioGroupItem>>;
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

const CHECKED_STATES = [
  { key: 'unchecked', label: 'unchecked', value: undefined },
  { key: 'checked', label: 'checked', value: 'item' },
] as const;

test.each(THEMES)('radio group states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <RadioMatrix states={STATES} />
    </Sheet>,
  );

  await forcePseudoStates(
    STATES.filter((state) => state.forced).map((state) => ({
      selector: `[data-visual-state="${state.key}"] [data-slot="radio-group-item"]`,
      pseudoClasses: state.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`radio-group-${theme}`);
});

function RadioMatrix({ states }: { states: readonly StateSpec[] }) {
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
      {CHECKED_STATES.map((checked) => (
        <Fragment key={checked.key}>
          <div className="text-muted-foreground text-xs">{checked.label}</div>
          {states.map((state) => (
            // Padded so the screenshot keeps the focus ring, which paints outside the item.
            <div
              className="p-1.5"
              data-testid={`cell-${checked.key}-${state.key}`}
              data-visual-state={state.key}
              key={state.key}
            >
              <RadioGroup aria-label={`${checked.label} ${state.label}`} defaultValue={checked.value}>
                <RadioGroupItem aria-label="item" value="item" {...state.props} />
              </RadioGroup>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
