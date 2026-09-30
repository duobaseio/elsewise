import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Checkbox } from '../../src/components/checkbox';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof Checkbox>>;
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

const CHECKED_STATES: readonly Omit<StateSpec, 'forced'>[] = [
  { key: 'unchecked', label: 'unchecked' },
  { key: 'checked', label: 'checked', props: { defaultChecked: true } },
];

test.each(THEMES)('checkbox states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <CheckboxMatrix states={STATES} />
    </Sheet>,
  );

  await forcePseudoStates(
    STATES.filter((state) => state.forced).map((state) => ({
      // The root is a `span` with button semantics, next to a hidden form
      // input, so `data-slot` is what identifies it — a tag-name selector
      // would hit the wrong element or none at all. Both rows share a state
      // key, so each force lands on the checked and unchecked cell together.
      selector: `[data-visual-state="${state.key}"] [data-slot="checkbox"]`,
      pseudoClasses: state.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`checkbox-${theme}`);
});

function CheckboxMatrix({ states }: { states: readonly StateSpec[] }) {
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
            <div
              // 6px of slack. The pen box paints 4px outside the border box
              // (`outline-2` at `outline-offset-2`) and a screenshot clips to
              // the captured element's bounding box, so without padding the
              // mark under test would be cropped.
              className="p-1.5"
              data-testid={`cell-${checked.key}-${state.key}`}
              data-visual-state={state.key}
              key={state.key}
            >
              <Checkbox aria-label={`${checked.label} ${state.label}`} {...checked.props} {...state.props} />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
