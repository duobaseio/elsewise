import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Input } from '../../../src/components/input';
import { HighlightProvider, Row, useHighlight } from '../../../src/components/settings';
import { Switch } from '../../../src/components/switch';

import { Sheet, THEMES } from '../../sheet.tsx';

test.each(THEMES)('rows (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex w-[480px] flex-col gap-6">
        <Row description="Wrap lines longer than the editor is wide." id="word-wrap" label="Word wrap">
          <Switch aria-label="Word wrap" defaultChecked />
        </Row>
        <Row description="The family the editor draws code in." id="font-family" label="Font family">
          <Input aria-label="Font family" className="w-40" defaultValue="JetBrains Mono" />
        </Row>
        <Row
          description="Colors for code."
          help="Themes come from plugins. Each language can override the editor-wide choice."
          id="theme"
          label="Theme"
        >
          <Input aria-label="Theme" className="w-40" defaultValue="Elsewise" />
        </Row>
        <Row id="minimap" label="Minimap">
          <Switch aria-label="Minimap" />
        </Row>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`row-${theme}`);
});

test.each(THEMES)('inherited and overridden (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="flex w-[480px] flex-col gap-6">
        <Row description="The display width of a tab character." id="tab-size" inherited label="Tab width">
          <Input aria-label="Tab width" className="w-16" defaultValue="4" />
        </Row>
        <Row description="The separator for new files." id="line-separator" label="Line endings" onReset={() => {}}>
          <Input aria-label="Line endings" className="w-20" defaultValue="LF" />
        </Row>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`row-inherited-${theme}`);
});

test.each(THEMES)('highlighted (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <HighlightProvider id="minimap">
        <div className="flex w-[480px] flex-col gap-6">
          <Row description="Wrap lines longer than the editor is wide." id="word-wrap" label="Word wrap">
            <Switch aria-label="Word wrap" defaultChecked />
          </Row>
          <Row description="Draw a map of the file beside the scrollbar." id="minimap" label="Minimap">
            <Switch aria-label="Minimap" />
          </Row>
          <Custom />
        </div>
      </HighlightProvider>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`row-highlighted-${theme}`);
});

test.each(THEMES)('custom highlighted (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <HighlightProvider id="guides">
        <div className="flex w-[480px] flex-col gap-6">
          <Row description="Draw a map of the file beside the scrollbar." id="minimap" label="Minimap">
            <Switch aria-label="Minimap" />
          </Row>
          <Custom />
        </div>
      </HighlightProvider>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`row-custom-highlighted-${theme}`);
});

// A row that opts out of `Row` and wires the highlight itself.
function Custom() {
  return (
    <div className="flex flex-col gap-2" id="guides" {...useHighlight<HTMLDivElement>('guides')}>
      <div className="-mx-1.5 self-start rounded-sm px-1.5 in-data-highlighted:bg-match-wash">Visual guides</div>
      <div className="flex gap-2">
        <Input aria-label="Guide 1" className="w-20" defaultValue="80" />
        <Input aria-label="Guide 2" className="w-20" defaultValue="120" />
      </div>
    </div>
  );
}
