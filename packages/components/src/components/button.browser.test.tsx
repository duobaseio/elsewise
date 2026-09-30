import { expect, test } from 'vitest';
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
