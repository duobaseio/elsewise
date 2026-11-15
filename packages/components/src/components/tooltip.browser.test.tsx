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

const INSTANT = 100;
const DELAYED = 500;

test('inside a provider, the second tooltip opens instantly and without animation', async () => {
  await render(
    <TooltipProvider>
      <Pair />
    </TooltipProvider>,
  );

  await userEvent.hover(first());
  await expect.element(tip('First tip'), { timeout: 2000 }).toBeVisible();
  expect(getComputedStyle(tip('First tip').element()).transitionDuration).toBe('0.125s');

  await userEvent.hover(second());
  await expect.element(tip('Second tip'), { timeout: INSTANT }).toBeVisible();
  expect(tip('Second tip').element()).toHaveAttribute('data-instant');
  expect(getComputedStyle(tip('Second tip').element()).transitionDuration).toBe('0s');
});

test('outside a provider, every tooltip waits out the delay', async () => {
  await render(<Pair />);

  await userEvent.hover(first());
  await expect.element(tip('First tip'), { timeout: DELAYED }).toBeVisible();

  await userEvent.hover(second());
  await new Promise((resolve) => setTimeout(resolve, INSTANT));
  expect(tip('Second tip').query()).toBeNull();
  await expect.element(tip('Second tip'), { timeout: DELAYED }).toBeVisible();
});

test('inside a provider, its delay applies', async () => {
  await render(
    <TooltipProvider delay={1000}>
      <Pair />
    </TooltipProvider>,
  );

  await userEvent.hover(first());
  await new Promise((resolve) => setTimeout(resolve, DELAYED));
  expect(tip('First tip').query()).toBeNull();
  await expect.element(tip('First tip'), { timeout: 2000 }).toBeVisible();
});
