import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Toggle } from '../../src/components/toggle';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof Toggle>>;
  forced?: readonly ForcedPseudoClass[];
};

const PRESSED = [
  { key: 'up', label: 'unpressed' },
  { key: 'down', label: 'pressed', props: { defaultPressed: true } },
] as const;

test.each(THEMES)('toggle attribute states (%s)', async (theme) => {
  const states: readonly StateSpec[] = [
    { key: 'rest', label: 'rest' },
    { key: 'disabled', label: 'disabled', props: { disabled: true } },
    { key: 'outline', label: 'outline', props: { variant: 'outline' } },
    { key: 'xs', label: 'xs', props: { size: 'xs' } },
    { key: 'sm', label: 'sm', props: { size: 'sm' } },
    { key: 'lg', label: 'lg', props: { size: 'lg' } },
  ];
  await render(
    <Sheet theme={theme}>
      <ToggleMatrix states={states} />
    </Sheet>,
  );
  await expect(page.getByTestId('sheet')).toMatchScreenshot(`toggle-attr-${theme}`);
});

test.each(THEMES)('toggle pseudo states (%s)', async (theme) => {
  const states: readonly StateSpec[] = [
    { key: 'hover', label: 'hover', forced: ['hover'] },
    { key: 'focus-visible', label: 'focus-visible', forced: ['focus', 'focus-visible'] },
    { key: 'active', label: 'active', forced: ['active'] },
  ];
  await render(
    <Sheet theme={theme}>
      <ToggleMatrix states={states} />
    </Sheet>,
  );
  await forcePseudoStates(
    states.map((state) => ({
      selector: `[data-visual-state="${state.key}"] [data-slot="toggle"]`,
      pseudoClasses: state.forced ?? [],
    })),
  );
  await expect(page.getByTestId('sheet')).toMatchScreenshot(`toggle-pseudo-${theme}`);
});

function ToggleMatrix({ states }: { states: readonly StateSpec[] }) {
  return (
    <div
      className="grid w-max items-center gap-x-5 gap-y-2"
      style={{ gridTemplateColumns: `max-content repeat(${states.length}, max-content)` }}
    >
      <div />
      {states.map((state) => (
        <div className="text-muted-foreground text-xs" key={state.key}>
          {state.label}
        </div>
      ))}
      {PRESSED.map((pressed) => (
        <Fragment key={pressed.key}>
          <div className="text-muted-foreground text-xs">{pressed.label}</div>
          {states.map((state) => (
            // Padded so the focus outline is inside the screenshot.
            <div className="p-1" data-visual-state={state.key} key={state.key}>
              <Toggle aria-label="Match case" {...('props' in pressed ? pressed.props : {})} {...state.props}>
                Cc
              </Toggle>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
