import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

describe('DropdownMenuItem', () => {
  test('recolors descendants while highlighted', async () => {
    const screen = await render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <span className="text-[rgb(255,0,0)]">Red</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const color = () => getComputedStyle(screen.getByText('Red').element()).color;

    await userEvent.hover(screen.getByRole('menuitem'));

    await expect.element(screen.getByRole('menuitem')).toHaveAttribute('data-highlighted');
    expect(color()).not.toBe('rgb(255, 0, 0)');
  });

  test('keeps colors of descendants while highlighted without recolor', async () => {
    const screen = await render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem recolor={false}>
            <span className="text-[rgb(255,0,0)]">Red</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await userEvent.hover(screen.getByRole('menuitem'));

    await expect.element(screen.getByRole('menuitem')).toHaveAttribute('data-highlighted');
    expect(getComputedStyle(screen.getByText('Red').element()).color).toBe('rgb(255, 0, 0)');
  });
});
