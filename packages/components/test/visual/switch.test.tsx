import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Switch } from '../../src/components/switch';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof Switch>>;
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

test.each(THEMES)('switch states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <SwitchMatrix states={STATES} />
    </Sheet>,
  );

  await forcePseudoStates(
    STATES.filter((state) => state.forced).map((state) => ({
      selector: `[data-visual-state="${state.key}"] [data-slot="switch"]`,
      pseudoClasses: state.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`switch-${theme}`);
});

test.each(THEMES)('switch sizes (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex w-max items-center gap-5 p-1.5">
        <Switch aria-label="sm" defaultChecked size="sm" />
        <Switch aria-label="sm unchecked" size="sm" />
        <Switch aria-label="default" defaultChecked />
        <Switch aria-label="default unchecked" />
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`switch-sizes-${theme}`);
});

function SwitchMatrix({ states }: { states: readonly StateSpec[] }) {
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
              className="p-1.5"
              data-testid={`cell-${checked.key}-${state.key}`}
              data-visual-state={state.key}
              key={state.key}
            >
              <Switch aria-label={`${checked.label} ${state.label}`} {...checked.props} {...state.props} />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
