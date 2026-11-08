import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { type Status, StatusIndicator } from '../../src/components/status-indicator';

import { Sheet, THEMES } from '../sheet';

const STATUSES = ['idle', 'running', 'partial', 'complete'] as const satisfies readonly Status[];

test.each(THEMES)('status indicator (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-2 gap-x-6 gap-y-2">
        {STATUSES.map((status) => [
          <div className="flex items-center gap-2 text-sm" key={`${status}-sm`}>
            <StatusIndicator status={status} />
            <span>{status}</span>
          </div>,
          <div className="flex items-center gap-2 text-base" key={`${status}-base`}>
            <StatusIndicator status={status} />
            <span>{status}</span>
          </div>,
        ])}
      </div>
    </Sheet>,
  );

  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = 0;
  }

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`status-indicator-${theme}`);
});
