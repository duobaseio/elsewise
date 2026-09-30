import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

function Pair() {
  return (
    <div className="flex gap-4 p-4">
      <Tooltip>
        <TooltipTrigger>first</TooltipTrigger>
        <TooltipContent>First tip</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>second</TooltipTrigger>
        <TooltipContent>Second tip</TooltipContent>
      </Tooltip>
    </div>
  );
}

const first = () => page.getByRole('button', { name: 'first' });
const second = () => page.getByRole('button', { name: 'second' });
const tip = (text: string) => page.getByText(text);

// Base UI's default open delay is 600ms; well inside that on one side, well past it on the other.
const INSTANT = 200;

test('inside a provider, the second tooltip opens instantly and without animation', async () => {
  await render(
    <TooltipProvider>
      <Pair />
    </TooltipProvider>,
  );

  await userEvent.hover(first());
  await expect.element(tip('First tip'), { timeout: 2000 }).toBeVisible();

  await userEvent.hover(second());
  await expect.element(tip('Second tip'), { timeout: INSTANT }).toBeVisible();
  expect(tip('Second tip').element()).toHaveAttribute('data-instant');
});

test('outside a provider, every tooltip waits out the full delay', async () => {
  await render(<Pair />);

  await userEvent.hover(first());
  await expect.element(tip('First tip'), { timeout: 2000 }).toBeVisible();

  await userEvent.hover(second());
  await new Promise((resolve) => setTimeout(resolve, INSTANT));
  expect(tip('Second tip').query()).toBeNull();
});
