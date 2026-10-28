import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PanelError } from '@/routes/settings/-panel-error';

import { THEMES } from '../../../sheet';

test.each(THEMES)('panel error (%s)', async (theme) => {
  render(
    <div
      className="bg-background font-sans text-foreground"
      data-brightness={theme}
      data-testid="sheet"
      style={{ width: 560 }}
    >
      <PanelError error={new Error('Cannot read properties of undefined (reading dictionary)')} />
    </div>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`panel-error-${theme}`);
});
