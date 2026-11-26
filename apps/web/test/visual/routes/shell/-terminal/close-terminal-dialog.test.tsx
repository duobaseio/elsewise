import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { CloseTerminalDialog } from '@/routes/_shell/$daemon/$project/$workspace/-terminal/close-terminal-dialog';
import { builtInApplication } from '../../../../commands';

import { THEMES } from '../../../../sheet';

test.each(THEMES)('close terminal dialog (%s)', async (theme) => {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 320);
  const application = builtInApplication();
  await render(
    <ApplicationManagerContext value={application}>
      <CloseTerminalDialog />
    </ApplicationManagerContext>,
  );
  void application.terminals.openCloseDialog({
    id: { daemon: 'local', project: 'elsewise', workspace: 'singapore', session: '1' },
    name: 'Server',
    cwd: '',
    program: '',
    args: [],
    restore: true,
    state: 'running',
    exit: null,
  });
  await expect.element(page.getByRole('dialog')).toBeVisible();

  // The backdrop covers the page, so its shot holds the dialog.
  const sheet = page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
  await expect(sheet).toMatchScreenshot(`close-terminal-dialog-${theme}`);
});
