import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { DockToolHeader } from '../../../src/components/dock';
import { Icon } from '../../../src/components/icon';

import { Sheet, THEMES } from '../../sheet';

test.each(THEMES)('dock tool header (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-5 gap-y-2">
        <div className="text-muted-foreground text-xs">title</div>
        <div className="h-[calc(var(--text-base--line-height)+12px)] w-max">
          <DockToolHeader title="Files" />
        </div>
        <div className="text-muted-foreground text-xs">icon</div>
        <div className="h-[calc(var(--text-base--line-height)+12px)] w-max">
          <DockToolHeader icon={<Icon className="size-4 shrink-0" name="folder" />} title="Files" />
        </div>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dock-tool-header-${theme}`);
});
