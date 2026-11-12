import { create } from '@bufbuild/protobuf';
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import type { FileTreeClipboard } from '@/fs/file-tree-manager';
import {
  CopyEntriesResponseSchema,
  CopyEntriesResponse_Failure_Reason as CopyReason,
  DirectoryListing_Entry_Type,
  ListDirectoryResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { MoveResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { PasteEntriesDialog } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/paste-entries-dialog';
import { builtInApplication } from '../../../../commands';

import { THEMES } from '../../../../sheet';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

const FOLDERS: Record<string, string[]> = {
  '': ['docs/', 'src/', 'README.md'],
  src: ['lib/', 'test/', 'main.ts'],
  'src/lib': [],
  'src/test': [],
};

// Opens the dialog to paste `clipboard` into `folder` over a daemon listing `FOLDERS`, whose copyEntries is given, on a
// page as large as the dialog and its suggestions need.
async function open(
  theme: 'light' | 'dark',
  folder: string,
  clipboard: Omit<FileTreeClipboard, 'workspace'>,
  copyEntries: Daemon['fileSystem']['copyEntries'] = async () => create(CopyEntriesResponseSchema),
) {
  // The dialog is portalled to the body, outside any sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  window.bridge = { window: { pickPaths: async () => [] } } as unknown as typeof window.bridge;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
    window.bridge = undefined;
  });
  await page.viewport(560, 480);
  const client = new QueryClient();
  const listDirectory: Daemon['fileSystem']['listDirectory'] = async ({ relativePath }) => {
    const names = FOLDERS[relativePath ?? ''];
    if (names === undefined) {
      throw new TransportError(Code.NOT_FOUND, 'missing');
    }
    return create(ListDirectoryResponseSchema, {
      listing: {
        entries: names.map((name) => ({
          name: name.replace(/\/$/, ''),
          type: name.endsWith('/') ? DirectoryListing_Entry_Type.DIRECTORY : DirectoryListing_Entry_Type.FILE,
        })),
      },
    });
  };
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, {
    fileSystem: { copyEntries, listDirectory },
    git: { move: async () => create(MoveResponseSchema) },
  } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <PasteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  const full = { ...clipboard, workspace: WORKSPACE.id };
  application.fileTree.clipboard = full;
  application.fileTree.pasteDialog.openWithPayload({ workspace: WORKSPACE, folder, clipboard: full });
  await expect.element(page.getByRole('dialog')).toBeVisible();
  // The backdrop covers the page, so its shot holds the dialog and its suggestions.
  return page.elementLocator(document.querySelector('[data-slot="dialog-overlay"]') ?? document.body);
}

test.each(THEMES)('paste dialog single entry (%s)', async (theme) => {
  const sheet = await open(theme, 'src/', { cut: false, paths: ['README.md'] });

  await expect(sheet).toMatchScreenshot(`paste-dialog-single-${theme}`);
});

test.each(THEMES)('paste dialog entries (%s)', async (theme) => {
  const sheet = await open(theme, 'src/lib/', { cut: true, paths: ['docs/', 'README.md'] });

  await expect(sheet).toMatchScreenshot(`paste-dialog-entries-${theme}`);
});

test.each(THEMES)('paste dialog folder suggestions (%s)', async (theme) => {
  const sheet = await open(theme, '', { cut: true, paths: ['docs/', 'README.md'] });
  await userEvent.fill(page.getByLabelText('To folder'), 'src/');
  await expect.element(page.getByRole('option', { name: 'src/lib/' })).toBeVisible();

  await expect(sheet).toMatchScreenshot(`paste-dialog-folder-suggestions-${theme}`);
});

test.each(THEMES)('paste dialog new folder (%s)', async (theme) => {
  const sheet = await open(theme, '', { cut: true, paths: ['docs/', 'README.md'] });
  await userEvent.fill(page.getByLabelText('To folder'), 'src/new');
  await expect.element(page.getByText('New folder “src/new”')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`paste-dialog-new-folder-${theme}`);
});

test.each(THEMES)('paste dialog already in folder (%s)', async (theme) => {
  const sheet = await open(theme, 'src/', { cut: true, paths: ['src/main.ts'] });
  await userEvent.click(page.getByRole('button', { name: 'Move' }));
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`paste-dialog-already-in-folder-${theme}`);
});

test.each(THEMES)('paste dialog failure (%s)', async (theme) => {
  const sheet = await open(theme, 'src/', { cut: false, paths: ['README.md'] }, async () =>
    create(CopyEntriesResponseSchema, {
      failures: [
        {
          relativePath: 'README.md',
          reason: CopyReason.OTHER,
          message: "EACCES: permission denied, copyfile '/elsewise/README.md'",
        },
      ],
    }),
  );
  await userEvent.click(page.getByRole('button', { name: 'Copy' }));
  await expect.element(page.getByRole('alert')).toBeVisible();

  await expect(sheet).toMatchScreenshot(`paste-dialog-failure-${theme}`);
});
