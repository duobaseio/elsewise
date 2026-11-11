import { create } from '@bufbuild/protobuf';
import { toast } from '@elsewise/components/components/toast';
import type { Workspace } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import type { PasteEntry } from '@/fs/paste';
import { CopyEntryResponseSchema } from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { MoveResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { OverwriteEntriesDialog } from './overwrite-entries-dialog';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

const ENTRIES: readonly PasteEntry[] = [
  { source: 'a.ts', destination: 'src/a.ts', folder: false },
  { source: 'b.ts', destination: 'src/b.ts', folder: false },
  { source: 'docs', destination: 'src/docs', folder: true },
];

// Renders the dialog over a daemon whose copyEntry and move are given, and returns the application to open it with.
async function mount({
  copyEntry = async () => create(CopyEntryResponseSchema),
  move = async () => create(MoveResponseSchema),
}: {
  copyEntry?: Daemon['fileSystem']['copyEntry'];
  move?: Daemon['git']['move'];
} = {}): Promise<ApplicationManager> {
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, {
    fileSystem: { copyEntry },
    git: { move },
  } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <OverwriteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

function open(application: ApplicationManager, cut: boolean, entries: readonly PasteEntry[]) {
  application.fileTree.clipboard = { cut, workspace: WORKSPACE.id, paths: entries.map((entry) => entry.source) };
  application.fileTree.overwriteDialog.openWithPayload({ workspace: WORKSPACE, folder: 'src', cut, entries });
}

describe('OverwriteEntriesDialog', () => {
  test('overwrites single entry', async () => {
    const copyEntry = vi.fn<Daemon['fileSystem']['copyEntry']>(async () => create(CopyEntryResponseSchema));
    const application = await mount({ copyEntry });
    open(application, false, ENTRIES.slice(0, 1));

    await expect.element(page.getByRole('heading', { name: 'Overwrite “a.ts” file?' })).toBeVisible();
    await expect.element(page.getByText('“a.ts” already exists in “src”.')).toBeVisible();
    await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Overwrite' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(copyEntry.mock.calls).toEqual([
      [{ root: '/elsewise', relativePath: 'a.ts', newRelativePath: 'src/a.ts', overwrite: true }],
    ]);
  });

  test('warns single folder loses contents', async () => {
    const application = await mount();
    open(application, false, ENTRIES.slice(2));

    await expect.element(page.getByRole('heading', { name: 'Overwrite “docs” folder?' })).toBeVisible();
    await expect
      .element(
        page.getByText(
          '“docs” already exists in “src”. The existing folder’s files and subfolders will be permanently deleted.',
        ),
      )
      .toBeVisible();
  });

  test('warns folders lose contents', async () => {
    const application = await mount();
    open(application, false, [ENTRIES[2] as PasteEntry, { source: 'lib', destination: 'src/lib', folder: true }]);

    await expect
      .element(
        page.getByText(
          'These folders already exist in “src”. Overwritten folders’ files and subfolders will be permanently deleted.',
        ),
      )
      .toBeVisible();
  });

  test('omits warning for files', async () => {
    const application = await mount();
    open(application, false, ENTRIES.slice(0, 2));

    await expect.element(page.getByText('These files already exist in “src”.', { exact: true })).toBeVisible();
  });

  test('overwrites checked entries', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    const application = await mount({ move });
    open(application, true, ENTRIES);

    await expect.element(page.getByRole('heading', { name: 'Overwrite 3 files and folders?' })).toBeVisible();
    await expect
      .element(
        page.getByText(
          'These files and folders already exist in “src”. Overwritten folders’ files and subfolders will be permanently deleted.',
        ),
      )
      .toBeVisible();
    await userEvent.click(page.getByRole('checkbox', { name: 'b.ts' }));
    await userEvent.click(page.getByRole('button', { name: 'Overwrite' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(move.mock.calls.map(([request]) => [request.relativePath, request.overwrite])).toEqual([
      ['a.ts', true],
      ['docs', true],
    ]);
  });

  test('fits few entries without scrolling', async () => {
    const application = await mount();
    open(application, false, ENTRIES.slice(0, 2));
    await expect.element(page.getByRole('checkbox', { name: 'a.ts' })).toBeVisible();

    const list = page.getByRole('checkbox', { name: 'a.ts' }).element().closest('label')?.parentElement;

    expect([list?.scrollWidth, list?.scrollHeight]).toEqual([list?.clientWidth, list?.clientHeight]);
  });

  test('disables overwrite with nothing checked', async () => {
    const application = await mount();
    open(application, false, ENTRIES.slice(0, 2));

    await userEvent.click(page.getByRole('checkbox', { name: 'a.ts' }));
    await userEvent.click(page.getByRole('checkbox', { name: 'b.ts' }));

    await expect.element(page.getByRole('button', { name: 'Overwrite' })).toBeDisabled();
  });

  test('skips every entry', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    const application = await mount({ move });
    open(application, true, ENTRIES);

    await userEvent.click(page.getByRole('button', { name: 'Skip' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
  });

  test('leaves clipboard alone', async () => {
    const application = await mount();
    open(application, true, ENTRIES);
    const skipped = application.fileTree.clipboard;
    await userEvent.click(page.getByRole('button', { name: 'Skip' }));
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(application.fileTree.clipboard).toBe(skipped);

    open(application, true, ENTRIES);
    const escaped = application.fileTree.clipboard;
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

    expect(application.fileTree.clipboard).toBe(escaped);
  });

  test('reports failed entry', async () => {
    const add = vi.spyOn(toast, 'add');
    const application = await mount({
      copyEntry: async ({ relativePath }) => {
        if (relativePath === 'a.ts') {
          throw new Error('denied');
        }
        return create(CopyEntryResponseSchema);
      },
    });
    open(application, false, ENTRIES.slice(0, 2));

    await userEvent.click(page.getByRole('button', { name: 'Overwrite' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'error', title: 'Copying “a.ts” failed', description: 'denied' }),
    );
  });
});
