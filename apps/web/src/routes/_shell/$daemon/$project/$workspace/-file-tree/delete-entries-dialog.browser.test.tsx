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
import { DeleteEntriesResponseSchema } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { FILE, mount as mountDock } from '../../../../../../../test/dock';
import { DeleteEntriesDialog } from './delete-entries-dialog';

const SELECTION: FileTreeSelection = {
  workspace: {
    id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
    name: 'Singapore',
    state: 'ok',
    main: false,
    absolutePath: '/elsewise',
  },
  relativePaths: ['src/', 'src/main.ts', 'README.md'],
};

// Renders the dialog over a daemon whose deleteEntries is `deleteEntries`, and returns the application to open it with.
async function mount(deleteEntries: Daemon['fileSystem']['deleteEntries']): Promise<ApplicationManager> {
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, { fileSystem: { deleteEntries } } as unknown as Daemon);
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

// Makes a dock of `workspace` that has the `paths` open the active one, and returns a function that reads its open
// files.
async function openFiles(
  application: ApplicationManager,
  paths: readonly string[],
  workspace = SELECTION.workspace.id,
): Promise<() => string[]> {
  const dockview = await mountDock();
  for (const path of paths) {
    dockview.addPanel({
      id: `file:${path}`,
      component: 'file',
      params: { path },
      position: { referencePanel: FILE.id },
    });
  }
  const dock = application.docks.attach(workspace, dockview);
  application.docks.active = dock;
  return () => dock.panels.flatMap((panel) => (panel.type === 'file' ? [panel.relativePath] : []));
}

describe('DeleteEntriesDialog', () => {
  test('deletes outermost paths', async () => {
    const deleteEntries = vi.fn<Daemon['fileSystem']['deleteEntries']>(async () => create(DeleteEntriesResponseSchema));
    const application = await mount(deleteEntries);
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await expect.element(page.getByRole('heading', { name: 'Delete 3 files and folders?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(deleteEntries.mock.calls).toEqual([[{ root: '/elsewise', relativePaths: ['src', 'README.md'] }]]);
  });

  test('names single folder', async () => {
    const application = await mount(async () => create(DeleteEntriesResponseSchema));
    application.fileTree.deleteDialog.openWithPayload({ ...SELECTION, relativePaths: ['src/'] });

    await expect.element(page.getByRole('heading', { name: 'Delete “src” folder?' })).toBeVisible();
    await expect
      .element(page.getByText('This folder’s files and subfolders will be permanently deleted.'))
      .toBeVisible();
  });

  test('deletes nothing on cancel', async () => {
    const deleteEntries = vi.fn<Daemon['fileSystem']['deleteEntries']>(async () => create(DeleteEntriesResponseSchema));
    const application = await mount(deleteEntries);
    application.fileTree.deleteDialog.openWithPayload({ ...SELECTION, relativePaths: ['README.md'] });

    await expect.element(page.getByRole('heading', { name: 'Delete “README.md” file?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(deleteEntries).not.toHaveBeenCalled();
  });

  test('reports failed path', async () => {
    const add = vi.spyOn(toast, 'add');
    const application = await mount(async () =>
      create(DeleteEntriesResponseSchema, { failures: [{ relativePath: 'src', message: 'denied' }] }),
    );
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'error', title: 'Deleting “src” failed', description: 'denied' }),
    );
  });

  test('drops deleted paths from clipboard', async () => {
    const application = await mount(async () =>
      create(DeleteEntriesResponseSchema, { failures: [{ relativePath: 'README.md', message: 'denied' }] }),
    );
    const workspace = SELECTION.workspace.id;
    application.fileTree.clipboard = { cut: false, workspace, paths: ['src/main.ts', 'README.md', 'docs/a.md'] };
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(application.fileTree.clipboard?.paths).toEqual(['README.md', 'docs/a.md']);
  });

  test('closes panels at and under deleted paths', async () => {
    const application = await mount(async () => create(DeleteEntriesResponseSchema));
    const files = await openFiles(application, ['src/main.ts', 'src/nested/a.ts', 'src-old/a.ts', 'README.md']);
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(files()).toEqual([FILE.relativePath, 'src-old/a.ts']);
  });

  test('keeps panels under failed path', async () => {
    const application = await mount(async () =>
      create(DeleteEntriesResponseSchema, { failures: [{ relativePath: 'src', message: 'denied' }] }),
    );
    const files = await openFiles(application, ['src/main.ts', 'README.md']);
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(files()).toEqual([FILE.relativePath, 'src/main.ts']);
  });

  test('keeps panels of other workspace', async () => {
    const application = await mount(async () => create(DeleteEntriesResponseSchema));
    const files = await openFiles(application, ['README.md'], { ...SELECTION.workspace.id, workspace: 'other' });
    application.fileTree.deleteDialog.openWithPayload(SELECTION);

    await userEvent.click(page.getByRole('button', { name: 'Delete' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(files()).toEqual([FILE.relativePath, 'README.md']);
  });
});
