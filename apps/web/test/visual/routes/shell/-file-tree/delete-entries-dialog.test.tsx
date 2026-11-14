import type { Workspace } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { LOCAL_DAEMON_ID } from '@/daemon';
import { DeleteEntriesDialog } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/delete-entries-dialog';
import { builtInApplication } from '../../../../commands';

import { THEMES } from '../../../../sheet';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

// Opens the dialog to delete `paths`, on a page as small as the dialog needs.
async function open(theme: 'light' | 'dark', paths: readonly string[]) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 320);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ApplicationManagerContext value={application}>
        <DeleteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  application.fileTree.deleteDialog.openWithPayload({ workspace: WORKSPACE, paths });
  await expect.element(page.getByRole('dialog')).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog.
  return page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
}

test.each(THEMES)('delete dialog file (%s)', async (theme) => {
  const sheet = await open(theme, ['README.md']);

  await expect(sheet).toMatchScreenshot(`delete-dialog-file-${theme}`);
});

test.each(THEMES)('delete dialog folder (%s)', async (theme) => {
  const sheet = await open(theme, ['src/']);

  await expect(sheet).toMatchScreenshot(`delete-dialog-folder-${theme}`);
});

test.each(THEMES)('delete dialog entries (%s)', async (theme) => {
  const sheet = await open(theme, ['src/', 'README.md', 'notes.md']);

  await expect(sheet).toMatchScreenshot(`delete-dialog-entries-${theme}`);
});
