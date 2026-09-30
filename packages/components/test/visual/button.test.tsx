import { GitBranchIcon } from '@phosphor-icons/react';
import type { ComponentProps, ReactNode } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Button } from '../../src/components/button';

import { type ForcedPseudoClass, forcePseudoState, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

const BUTTON_VARIANTS = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const;

type StateSpec = {
  key: string;
  label: string;
  props?: Partial<ComponentProps<typeof Button>>;
  children?: ReactNode;
};

test.each(THEMES)('button attribute states (%s)', async (theme) => {
  const attributeStates: readonly StateSpec[] = [
    { key: 'baseline', label: 'baseline' },
    { key: 'disabled', label: 'disabled', props: { disabled: true } },
    {
      key: 'expanded',
      label: 'aria-expanded',
      props: { 'aria-expanded': true },
    },
    { key: 'invalid', label: 'aria-invalid', props: { 'aria-invalid': true } },
  ];

  await render(
    <Sheet theme={theme}>
      <ButtonMatrix states={attributeStates} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`button-attr-${theme}`);
});

test.each(THEMES)('button pseudo states (%s)', async (theme) => {
  const pseudoStates: readonly {
    spec: StateSpec;
    forced: readonly ForcedPseudoClass[];
  }[] = [
    { spec: { key: 'active', label: 'active' }, forced: ['active'] },
    { spec: { key: 'hover', label: 'hover' }, forced: ['hover'] },
    {
      spec: { key: 'focus-visible', label: 'focus-visible' },
      forced: ['focus', 'focus-visible'],
    },
  ];

  await render(
    <Sheet theme={theme}>
      <ButtonMatrix states={pseudoStates.map(({ spec }) => spec)} />
    </Sheet>,
  );

  await forcePseudoStates(
    pseudoStates.map(({ spec, forced }) => ({
      selector: `[data-visual-state="${spec.key}"] button`,
      pseudoClasses: forced,
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`button-pseudo-${theme}`);
});

test.each(THEMES)('button sizes (%s)', async (theme) => {
  const sizes: readonly StateSpec[] = [
    { key: 'xs', label: 'xs', props: { size: 'xs' } },
    { key: 'sm', label: 'sm', props: { size: 'sm' } },
    { key: 'default', label: 'default' },
    { key: 'lg', label: 'lg', props: { size: 'lg' } },
    {
      key: 'icon-xs',
      label: 'icon-xs',
      props: { size: 'icon-xs', 'aria-label': 'Branch' },
      children: <GitBranchIcon />,
    },
    {
      key: 'icon-sm',
      label: 'icon-sm',
      props: { size: 'icon-sm', 'aria-label': 'Branch' },
      children: <GitBranchIcon />,
    },
    {
      key: 'icon',
      label: 'icon',
      props: { size: 'icon', 'aria-label': 'Branch' },
      children: <GitBranchIcon />,
    },
    {
      key: 'icon-lg',
      label: 'icon-lg',
      props: { size: 'icon-lg', 'aria-label': 'Branch' },
      children: <GitBranchIcon />,
    },
  ];

  await render(
    <Sheet theme={theme}>
      <ButtonMatrix states={sizes} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`button-size-${theme}`);
});

// Guards the assumption the pseudo-state sheet rests on. If `CSS.forcePseudoState` ever diverges from a real pointer,
// every hover and active baseline is fiction and nothing else in this file would notice.
//
// It compares two captures directly rather than against a stored reference, so it keeps its teeth on `--update` runs
// too. Only one cell exists and no ancestor carries hover styling, so a real pointer resting over the cell cannot
// contribute anything the forced state misses.
test('forced :hover renders identically to a real pointer hover', async () => {
  const selector = '[data-visual-state="hover"] button';
  await render(
    <Sheet theme="light">
      <ButtonMatrix states={[{ key: 'hover', label: 'hover' }]} />
    </Sheet>,
  );
  const cell = page.getByTestId('cell-default-hover');

  await forcePseudoState(selector, ['hover']);
  const forced = await page.screenshot({ element: cell, save: false });

  await forcePseudoState(selector, []);
  await userEvent.hover(cell.getByRole('button'));
  const real = await page.screenshot({ element: cell, save: false });

  expect(real).toBe(forced);
});

/** Variants down, states across — one image per theme instead of one per cell. */
function ButtonMatrix({ states }: { states: readonly StateSpec[] }) {
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
      {BUTTON_VARIANTS.map((variant) => (
        <Fragment key={variant}>
          <div className="text-muted-foreground text-xs">{variant}</div>
          {states.map((state) => (
            <div
              // 6px of slack. `focus-visible:outline-2 outline-offset-2` paints
              // 4px outside the border box, and a screenshot clips to the
              // captured element's bounding box — without padding, the ring
              // under test would be silently cropped away.
              className="p-1.5"
              data-testid={`cell-${variant}-${state.key}`}
              data-visual-state={state.key}
              key={state.key}
            >
              <Button variant={variant} {...state.props}>
                {state.children ?? 'Commit'}
              </Button>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
