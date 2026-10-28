import type { Terminal as XTerm } from '@xterm/xterm';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { CommandContextMenu } from '@/command/context-menu';
import { DEFAULT_CONTEXT_MENU } from '@/terminal/context-menu/default-context-menu';
import { builtInCommands } from '../../../commands';

import { THEMES } from '../../../sheet';

// A terminal with a selection, for every built-in item to show.
const TERMINAL = { buffer: {}, hasSelection: () => true, options: { disableStdin: false } } as unknown as XTerm;

test.each(THEMES)('terminal context menu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  render(
    <CommandManagerContext value={builtInCommands()}>
      <div
        className="bg-background font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 320, height: 180 }}
      >
        <CommandContextMenu menu={DEFAULT_CONTEXT_MENU} target={{ current: TERMINAL }} className="block size-full">
          <div className="size-full" data-testid="target" />
        </CommandContextMenu>
      </div>
    </CommandManagerContext>,
  );

  await userEvent.click(page.getByTestId('target'), { button: 'right', position: { x: 8, y: 8 } });
  await expect.element(page.getByRole('menuitem', { name: /Copy/ })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`terminal-context-menu-${theme}`);
});
