import type { Workspace } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, onTestFinished, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { LOCAL_DAEMON_ID } from '@/daemon';
import type { PasteEntry } from '@/fs/paste';
import { OverwriteEntriesDialog } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/overwrite-entries-dialog';
import { builtInApplication } from '../../../../commands';

import { THEMES } from '../../../../sheet';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

const ENTRIES: readonly PasteEntry[] = [
  { source: 'main.ts', destination: 'src/main.ts', folder: false },
  { source: 'notes.md', destination: 'src/notes.md', folder: false },
  { source: 'docs', destination: 'src/docs', folder: true },
];

// Opens the dialog to overwrite `entries` in “src”, on a page as small as the dialog needs.
async function open(theme: 'light' | 'dark', entries: readonly PasteEntry[]) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 400);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ApplicationManagerContext value={application}>
        <OverwriteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  application.fileTree.overwriteDialog.openWithPayload({ workspace: WORKSPACE, folder: 'src', cut: true, entries });
  await expect.element(page.getByRole('dialog')).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog.
  return page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
}

test.each(THEMES)('overwrite dialog file (%s)', async (theme) => {
  const sheet = await open(theme, ENTRIES.slice(0, 1));

  await expect(sheet).toMatchScreenshot(`overwrite-dialog-file-${theme}`);
});

test.each(THEMES)('overwrite dialog folder (%s)', async (theme) => {
  const sheet = await open(theme, ENTRIES.slice(2));

  await expect(sheet).toMatchScreenshot(`overwrite-dialog-folder-${theme}`);
});

test.each(THEMES)('overwrite dialog entries (%s)', async (theme) => {
  const sheet = await open(theme, ENTRIES);

  await expect(sheet).toMatchScreenshot(`overwrite-dialog-entries-${theme}`);
});
