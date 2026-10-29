import { Icon } from '@elsewise/components/components/icon';
import { TooltipProvider } from '@elsewise/components/components/tooltip';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { SearchAction, SearchOption } from '@/components/search-controls';

import { forcePseudoStates, THEMES } from '../../sheet';

test.each(THEMES)('search controls (%s)', async (theme) => {
  render(
    <div className="flex w-fit items-center gap-1 bg-popover p-2 font-sans" data-brightness={theme} data-testid="sheet">
      <SearchOption label="Off" onChange={() => {}} pressed={false}>
        Cc
      </SearchOption>
      <SearchOption label="On" onChange={() => {}} pressed>
        W
      </SearchOption>
      <span data-testid="hover-off">
        <SearchOption label="Hovered off" onChange={() => {}} pressed={false}>
          .*
        </SearchOption>
      </span>
      <span data-testid="hover-on">
        <SearchOption label="Hovered on" onChange={() => {}} pressed>
          .*
        </SearchOption>
      </span>
      <SearchAction className="text-muted-foreground hover:text-foreground" label="Rest">
        <Icon name="previous" />
      </SearchAction>
      <span data-testid="hover-action">
        <SearchAction className="text-muted-foreground hover:text-foreground" label="Hovered">
          <Icon name="next" />
        </SearchAction>
      </span>
      <SearchAction className="text-muted-foreground hover:text-foreground" disabled label="Disabled">
        <Icon name="close" />
      </SearchAction>
    </div>,
  );
  await forcePseudoStates([
    { selector: '[data-testid="hover-off"] button', pseudoClasses: ['hover'] },
    { selector: '[data-testid="hover-on"] button', pseudoClasses: ['hover'] },
    { selector: '[data-testid="hover-action"] button', pseudoClasses: ['hover'] },
  ]);
  onTestFinished(() => forcePseudoStates([{ selector: '[data-testid^="hover-"] button', pseudoClasses: [] }]));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-controls-${theme}`);
});

test.each(THEMES)('search action tooltip (%s)', async (theme) => {
  // The tooltip is portalled to the body, which takes the page's brightness.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  render(
    <div
      className="flex justify-center bg-background p-2 font-sans"
      data-brightness={theme}
      data-testid="sheet"
      style={{ width: 240, height: 72 }}
    >
      <TooltipProvider delay={0}>
        <SearchAction className="text-muted-foreground hover:text-foreground" hint="Shift-Enter" label="Previous match">
          <Icon name="previous" />
        </SearchAction>
      </TooltipProvider>
    </div>,
  );

  await userEvent.hover(page.getByRole('button', { name: 'Previous match' }));
  await expect.poll(() => document.querySelector('[data-slot="tooltip-content"][data-open]')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`search-action-tooltip-${theme}`);
});
