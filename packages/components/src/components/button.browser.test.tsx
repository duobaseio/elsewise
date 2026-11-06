import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { Button } from './button';

test('button rendered as a link keeps the default cursor', async () => {
  const screen = await render(
    <Button nativeButton={false} render={<a href="/settings" />}>
      Settings
    </Button>,
  );
  const link = screen.getByRole('button').element();
  expect(getComputedStyle(link).cursor).toBe('default');
});

test('pending button ignores clicks and keeps its name', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <Button onClick={onClick} pending>
      Delete
    </Button>,
  );

  await screen.getByRole('button', { name: 'Delete' }).click({ force: true });

  expect(onClick).not.toHaveBeenCalled();
  await expect.element(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-busy', 'true');
});

test('pending button keeps its width', async () => {
  const screen = await render(<Button pending={false}>Delete</Button>);
  const width = screen.getByRole('button').element().getBoundingClientRect().width;

  await screen.rerender(<Button pending>Delete</Button>);

  expect(screen.getByRole('button').element().getBoundingClientRect().width).toBe(width);
});
