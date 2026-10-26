import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Input } from '../../../src/components/input';
import { Separator } from '../../../src/components/separator';
import { Page, Row, SplitPage } from '../../../src/components/settings';
import { Switch } from '../../../src/components/switch';

import { Sheet, THEMES } from '../../sheet.tsx';

const ROWS = (
  <>
    <Row description="Wrap lines longer than the editor is wide." id="word-wrap" label="Word wrap">
      <Switch aria-label="Word wrap" defaultChecked />
    </Row>
    <Separator />
    <Row description="The family the editor draws code in." id="font-family" label="Font family">
      <Input aria-label="Font family" className="w-40" defaultValue="JetBrains Mono" />
    </Row>
  </>
);

test.each(THEMES)('page (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="w-[800px]">
        <Page title="Editor">{ROWS}</Page>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`page-${theme}`);
});

test.each(THEMES)('split page (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="h-[360px] w-[1100px]">
        <SplitPage preview={<div className="size-full bg-surface" />} title="Editor">
          {ROWS}
        </SplitPage>
      </div>
    </Sheet>,
  );
  await vi.waitFor(() => {
    if (document.querySelectorAll('.dv-view').length !== 2) {
      throw new Error('split not built');
    }
  });

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`split-page-${theme}`);
});
