import { create } from '@bufbuild/protobuf';
import { toast } from '@elsewise/components/components/toast';
import type { FileTreeSelection } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { DeleteEntryResponseSchema } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { DeleteEntriesDialog } from './delete-entries-dialog';

const SELECTION: FileTreeSelection = {
  workspace: {
    id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
    name: 'Singapore',
    state: 'ok',
    main: false,
    absolutePath: '/elsewise',
  },
  paths: ['src/', 'src/main.ts', 'README.md'],
};

// Renders the dialog over a daemon whose deleteEntry is `deleteEntry`, and returns the application to open it with.
async function mount(deleteEntry: Daemon['fileSystem']['deleteEntry']): Promise<ApplicationManager> {
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, { fileSystem: { deleteEntry } } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <DeleteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

describe('DeleteEntriesDialog', () => {
  test('deletes outermost paths', async () => {
    const deleteEntry = vi.fn<Daemon['fileSystem']['deleteEntry']>(async () => create(DeleteEntryResponseSchema));
    const application = await mount(deleteEntry);
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await expect.element(page.getByRole('heading', { name: 'Delete 3 files and folders?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(deleteEntry.mock.calls).toEqual([
      [{ root: '/elsewise', relativePath: 'src' }],
      [{ root: '/elsewise', relativePath: 'README.md' }],
    ]);
  });

  test('names single folder', async () => {
    const application = await mount(async () => create(DeleteEntryResponseSchema));
    application.fileTree.deleteDialog.openWithPayload({ ...SELECTION, paths: ['src/'] });

    await expect.element(page.getByRole('heading', { name: 'Delete “src” folder?' })).toBeVisible();
    await expect
      .element(page.getByText('This folder’s files and subfolders will be permanently deleted.'))
      .toBeVisible();
  });

  test('deletes nothing on cancel', async () => {
    const deleteEntry = vi.fn<Daemon['fileSystem']['deleteEntry']>(async () => create(DeleteEntryResponseSchema));
    const application = await mount(deleteEntry);
    application.fileTree.deleteDialog.openWithPayload({ ...SELECTION, paths: ['README.md'] });

    await expect.element(page.getByRole('heading', { name: 'Delete “README.md” file?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  test('reports failed path', async () => {
    const add = vi.spyOn(toast, 'add');
    const deleteEntry = vi.fn<Daemon['fileSystem']['deleteEntry']>(async ({ relativePath }) => {
      if (relativePath === 'src') {
        throw new Error('denied');
      }
      return create(DeleteEntryResponseSchema);
    });
    const application = await mount(deleteEntry);
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'error', title: 'Deleting “src” failed', description: 'denied' }),
    );
  });
});
