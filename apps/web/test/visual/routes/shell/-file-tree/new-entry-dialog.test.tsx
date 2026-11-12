import { create } from '@bufbuild/protobuf';
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  CreateDirectoryResponseSchema,
  WriteFileResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { NewEntryDialog } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/new-entry-dialog';
import { builtInApplication } from '../../../../commands';

import { THEMES } from '../../../../sheet';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

// Opens the dialog for a new `kind` in `folder` over a daemon whose writeFile is given, on a page as small as the
// dialog needs.
async function open(
  theme: 'light' | 'dark',
  kind: 'file' | 'folder',
  folder: string,
  writeFile: Daemon['fileSystem']['writeFile'] = async () => create(WriteFileResponseSchema),
) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await page.viewport(560, 360);
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, {
    fileSystem: { writeFile, createDirectory: async () => create(CreateDirectoryResponseSchema) },
  } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <NewEntryDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  application.fileTree.newDialog.openWithPayload({ workspace: WORKSPACE, folder, kind });
  await expect.element(page.getByRole('dialog')).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog.
  return page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
}

test.each(THEMES)('new file dialog (%s)', async (theme) => {
  const sheet = await open(theme, 'file', 'src/');
  await userEvent.fill(page.getByLabelText('Name'), 'notes.md');

  await expect(sheet).toMatchScreenshot(`new-file-dialog-${theme}`);
});

test.each(THEMES)('new folder dialog (%s)', async (theme) => {
  const sheet = await open(theme, 'folder', '');

  await expect(sheet).toMatchScreenshot(`new-folder-dialog-${theme}`);
});

test.each(THEMES)('new folder dialog file name (%s)', async (theme) => {
  const sheet = await open(theme, 'folder', 'src/');
  await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
  await expect.element(page.getByText(/Did you mean to/)).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-folder-dialog-file-name-${theme}`);
});

test.each(THEMES)('new file dialog taken name (%s)', async (theme) => {
  const sheet = await open(theme, 'file', 'src/', async () => {
    throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the path');
  });
  await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-file-dialog-taken-name-${theme}`);
});

test.each(THEMES)('new file dialog failure (%s)', async (theme) => {
  const sheet = await open(theme, 'file', 'src/', async () => {
    throw new TransportError(Code.PERMISSION_DENIED, "EACCES: permission denied, open '/elsewise/src/notes.md'");
  });
  await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-file-dialog-failure-${theme}`);
});

test.each(THEMES)('new file dialog backslash (%s)', async (theme) => {
  const sheet = await open(theme, 'file', 'src/');
  await userEvent.fill(page.getByLabelText('Name'), 'lib\\index.ts');
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`new-file-dialog-backslash-${theme}`);
});
