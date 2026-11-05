import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Button } from './button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './dialog';

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
