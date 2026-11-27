import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../dropdown-menu';
import { DockTabHeader } from './tab-header';

describe('DockTabHeader', () => {
  test('omits close button without onClose', async () => {
    const screen = await render(<DockTabHeader title="a.ts" />);

    await expect.element(screen.getByText('a.ts')).toBeVisible();
    expect(screen.getByRole('button').elements()).toHaveLength(0);
  });

  test('names close button after title', async () => {
    const screen = await render(<DockTabHeader onClose={() => {}} title={<em>a.ts</em>} />);

    await expect.element(screen.getByRole('button', { name: 'Close a.ts' })).toBeInTheDocument();
  });

  test('keeps click on close button from tab', async () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const screen = await render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the tab
      // biome-ignore lint/a11y/useKeyWithClickEvents: stands in for the tab
      <div className="dv-tab dv-active-tab" onClick={onClick} onPointerDown={onPointerDown}>
        <DockTabHeader onClose={onClose} title="a.ts" />
      </div>,
    );

    await screen.getByRole('button', { name: 'Close a.ts' }).click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  test('shows status in place of close icon until hovered', async () => {
    const screen = await render(
      <>
        <div className="dv-tab">
          <DockTabHeader onClose={() => {}} status={<span data-testid="status">●</span>} title="a.ts" />
        </div>
        <p>Other</p>
      </>,
    );
    const icon = () => getComputedStyle(screen.getByRole('button').element().querySelector('svg') as Element).display;
    await userEvent.hover(screen.getByText('Other'));

    await expect.element(screen.getByTestId('status')).toBeVisible();
    expect(icon()).toBe('none');

    await userEvent.hover(screen.getByText('a.ts'));

    await expect.element(screen.getByTestId('status')).not.toBeVisible();
    expect(icon()).not.toBe('none');
  });

  test('shows status in place of close icon until menu item is highlighted', async () => {
    const screen = await render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem recolor={false}>
            <DockTabHeader onClose={() => {}} status={<span data-testid="status">●</span>} title="a.ts" />
          </DropdownMenuItem>
          <DropdownMenuItem>Other</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const icon = () =>
      getComputedStyle(screen.getByRole('button', { name: 'Close a.ts' }).element().querySelector('svg') as Element)
        .display;
    await userEvent.hover(screen.getByText('Other'));

    await expect.element(screen.getByTestId('status')).toBeVisible();
    expect(icon()).toBe('none');

    await userEvent.hover(screen.getByText('a.ts'));

    await expect.element(screen.getByTestId('status')).not.toBeVisible();
    expect(icon()).not.toBe('none');
  });

  test('shows close button in highlighted menu item', async () => {
    const screen = await render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem recolor={false}>
            <DockTabHeader onClose={() => {}} title="a.ts" />
          </DropdownMenuItem>
          <DropdownMenuItem>Other</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const opacity = () => getComputedStyle(screen.getByRole('button', { name: 'Close a.ts' }).element()).opacity;
    await userEvent.hover(screen.getByText('Other'));
    await vi.waitFor(() => expect(opacity()).toBe('0'));

    await userEvent.hover(screen.getByText('a.ts'));

    await vi.waitFor(() => expect(opacity()).toBe('1'));
  });
});
