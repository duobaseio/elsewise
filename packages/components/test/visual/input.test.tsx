import type { ComponentProps } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Input } from '../../src/components/input';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof Input>>;
  forced?: readonly ForcedPseudoClass[];
};

const STATES: readonly StateSpec[] = [
  { key: 'rest', label: 'rest' },
  { key: 'disabled', label: 'disabled', props: { disabled: true } },
  { key: 'readonly', label: 'readOnly', props: { readOnly: true } },
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

const CONTENTS = [
  {
    key: 'hint',
    label: 'empty with hint',
    props: { placeholder: 'Branch name' },
  },
  {
    key: 'text',
    label: 'actual text',
    props: { defaultValue: 'feat/passport' },
  },
] as const;

for (const content of CONTENTS) {
  test.each(THEMES)(`input ${content.label} (%s)`, async (theme) => {
    await render(
      <Sheet theme={theme}>
        <InputMatrix content={content.props} states={STATES} />
      </Sheet>,
    );

    await forcePseudoStates(
      STATES.filter((state) => state.forced).map((state) => ({
        selector: `[data-visual-state="${state.key}"] input`,
        pseudoClasses: state.forced ?? [],
      })),
    );

    await expect(page.getByTestId('sheet')).toMatchScreenshot(`input-${content.key}-${theme}`);
  });
}

function InputMatrix({
  content,
  states,
}: {
  content: Partial<ComponentProps<typeof Input>>;
  states: readonly StateSpec[];
}) {
  return (
    <div
      className="grid w-max items-center gap-x-5 gap-y-2"
      style={{
        // Unlike Button, `Input` is `w-full` and cannot size its own column;
        // the fixed track is what gives every cell the same box to paint in.
        gridTemplateColumns: `repeat(${states.length}, 10rem)`,
      }}
    >
      {states.map((state) => (
        <div className="text-muted-foreground text-xs" key={state.key}>
          {state.label}
        </div>
      ))}
      {states.map((state) => (
        <div data-testid={`cell-${state.key}`} data-visual-state={state.key} key={state.key}>
          <Input {...content} {...state.props} />
        </div>
      ))}
    </div>
  );
}
