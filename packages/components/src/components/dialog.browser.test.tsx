import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from './dialog';

describe('DialogFooter', () => {
  test('moves between buttons by arrows, skipping disabled', async () => {
    await render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogFooter>
            <Button>First</Button>
            <Button disabled>Second</Button>
            <Button>Third</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    page.getByRole('button', { name: 'First' }).element().focus();

    await userEvent.keyboard('{ArrowRight}');
    await expect.element(page.getByRole('button', { name: 'Third' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(page.getByRole('button', { name: 'Third' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');

    await expect.element(page.getByRole('button', { name: 'First' })).toHaveFocus();
  });
});

describe('DialogContent', () => {
  test('shows focus on first button', async () => {
    await render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Title</DialogTitle>
          <DialogFooter>
            <Button>Cancel</Button>
            <Button>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    await page.getByRole('button', { name: 'Open' }).click();

    await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(page.getByRole('button', { name: 'Cancel' }).element().matches(':focus-visible')).toBe(true);
  });
});
