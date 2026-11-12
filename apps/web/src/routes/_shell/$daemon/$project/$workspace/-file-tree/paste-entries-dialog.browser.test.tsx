import { create } from '@bufbuild/protobuf';
import { toast } from '@elsewise/components/components/toast';
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import type { FileTreeClipboard } from '@/fs/file-tree-manager';
import {
  CopyEntriesResponseSchema,
  CopyEntriesResponse_Failure_Reason as CopyReason,
  DirectoryListing_Entry_Type,
  ListDirectoryResponseSchema,
  MoveEntriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import {
  MoveResponse_Failure_Reason as MoveReason,
  MoveResponseSchema,
} from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { PasteEntriesDialog } from './paste-entries-dialog';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

const FOLDERS: Record<string, string[]> = { '': ['src/', 'README.md'], src: ['lib/', 'main.ts'], 'src/lib': [] };

afterEach(() => {
  window.bridge = undefined;
});

interface Fake {
  copyEntries?: Daemon['fileSystem']['copyEntries'];
  moveEntries?: Daemon['fileSystem']['moveEntries'];
  move?: Daemon['git']['move'];
}

// Renders the dialog over a daemon listing `FOLDERS`, and returns the application to open it with.
async function mount({
  copyEntries = async () => create(CopyEntriesResponseSchema),
  moveEntries = async () => create(MoveEntriesResponseSchema),
  move = async () => create(MoveResponseSchema),
}: Fake = {}): Promise<ApplicationManager> {
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
    fileSystem: { copyEntries, moveEntries, listDirectory },
    git: { move },
  } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <PasteEntriesDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

function open(application: ApplicationManager, folder: string, clipboard: Omit<FileTreeClipboard, 'workspace'>) {
  const full = { ...clipboard, workspace: WORKSPACE.id };
  application.fileTree.clipboard = full;
  application.fileTree.pasteDialog.openWithPayload({ workspace: WORKSPACE, folder, clipboard: full });
}

describe('PasteEntriesDialog', () => {
  test('copies entry under new name, keeping clipboard', async () => {
    const copyEntries = vi.fn<Daemon['fileSystem']['copyEntries']>(async () => create(CopyEntriesResponseSchema));
    const application = await mount({ copyEntries });
    open(application, 'src/', { cut: false, paths: ['README.md'] });

    await expect.element(page.getByRole('heading', { name: 'Copy “README.md” file' })).toBeVisible();
    await expect.element(page.getByLabelText('New name')).toHaveValue('README.md');
    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/');
    await userEvent.keyboard('NOTES');
    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(copyEntries.mock.calls).toEqual([
      [
        {
          root: '/elsewise',
          entries: [{ relativePath: 'README.md', newRelativePath: 'src/NOTES.md' }],
          overwrite: false,
        },
      ],
    ]);
    expect(application.fileTree.clipboard).not.toBeNull();
  });

  test('resets form for each paste', async () => {
    const application = await mount();
    open(application, 'src/', { cut: false, paths: ['README.md'] });
    await expect.element(page.getByRole('heading', { name: 'Copy “README.md” file' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

    open(application, 'lib/', { cut: true, paths: ['main.ts'] });

    await expect.element(page.getByRole('heading', { name: 'Move “main.ts” file' })).toBeVisible();
    await expect.element(page.getByLabelText('New name')).toHaveValue('main.ts');
    await expect.element(page.getByLabelText('To folder')).toHaveValue('lib/');
  });

  test('names single folder', async () => {
    const application = await mount();
    open(application, 'src/', { cut: true, paths: ['docs/'] });

    await expect.element(page.getByRole('heading', { name: 'Move “docs” folder' })).toBeVisible();
  });

  test('moves outermost entries through git, clearing clipboard', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    const application = await mount({ move });
    open(application, 'src/lib/', { cut: true, paths: ['docs/', 'docs/a.md', 'README.md'] });

    await expect.element(page.getByRole('heading', { name: 'Move 2 files and folders' })).toBeVisible();
    await expect.element(page.getByLabelText('New name')).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Move' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(move.mock.calls).toEqual([
      [
        {
          absolutePath: '/elsewise',
          entries: [
            { relativePath: 'docs', newRelativePath: 'src/lib/docs' },
            { relativePath: 'README.md', newRelativePath: 'src/lib/README.md' },
          ],
          overwrite: false,
        },
      ],
    ]);
    expect(application.fileTree.clipboard).toBeNull();
  });

  test('moves through file system outside git', async () => {
    const moveEntries = vi.fn<Daemon['fileSystem']['moveEntries']>(async () => create(MoveEntriesResponseSchema));
    const application = await mount({ moveEntries });
    const workspace = { ...WORKSPACE, state: 'broken' as const };
    const clipboard = { cut: true, workspace: WORKSPACE.id, paths: ['README.md'] };
    application.fileTree.pasteDialog.openWithPayload({ workspace, folder: 'src/', clipboard });

    await userEvent.click(page.getByRole('button', { name: 'Move' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(moveEntries.mock.calls).toEqual([
      [
        {
          root: '/elsewise',
          entries: [{ relativePath: 'README.md', newRelativePath: 'src/README.md' }],
          overwrite: false,
        },
      ],
    ]);
  });

  test('refuses copy onto itself', async () => {
    const copyEntries = vi.fn<Daemon['fileSystem']['copyEntries']>(async () => create(CopyEntriesResponseSchema));
    const application = await mount({ copyEntries });
    open(application, '', { cut: false, paths: ['README.md'] });

    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('“README.md” already exists in “Singapore”.');
    expect(copyEntries).not.toHaveBeenCalled();
  });

  test('refuses move into own folder', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    const application = await mount({ move });
    open(application, 'src/', { cut: true, paths: ['src/main.ts'] });

    await userEvent.click(page.getByRole('button', { name: 'Move' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('“main.ts” is already in “src”.');
    expect(move).not.toHaveBeenCalled();
  });

  test('refuses name with separator', async () => {
    const application = await mount();
    open(application, 'src/', { cut: false, paths: ['README.md'] });

    await userEvent.fill(page.getByLabelText('New name'), 'docs/README.md');
    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('Names cannot contain “/”.');
  });

  test('hands conflicts to overwrite dialog', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () =>
      create(MoveResponseSchema, {
        failures: [
          { relativePath: 'a.ts', reason: MoveReason.ALREADY_EXISTS },
          { relativePath: 'docs', reason: MoveReason.ALREADY_EXISTS },
        ],
      }),
    );
    const application = await mount({ move });
    const overwrite = vi.spyOn(application.fileTree.overwriteDialog, 'openWithPayload');
    open(application, 'src/', { cut: true, paths: ['a.ts', 'docs/', 'c.ts'] });

    await userEvent.click(page.getByRole('button', { name: 'Move' }));

    await expect
      .poll(() => overwrite.mock.calls)
      .toEqual([
        [
          {
            workspace: WORKSPACE,
            folder: 'src',
            cut: true,
            entries: [
              { source: 'a.ts', destination: 'src/a.ts', folder: false },
              { source: 'docs', destination: 'src/docs', folder: true },
            ],
          },
        ],
      ]);
    expect(application.fileTree.clipboard).toBeNull();
  });

  test('keeps clipboard when handing copy conflicts', async () => {
    const application = await mount({
      copyEntries: async () =>
        create(CopyEntriesResponseSchema, {
          failures: [
            { relativePath: 'a.ts', reason: CopyReason.ALREADY_EXISTS },
            { relativePath: 'b.ts', reason: CopyReason.ALREADY_EXISTS },
          ],
        }),
    });
    const overwrite = vi.spyOn(application.fileTree.overwriteDialog, 'openWithPayload');
    open(application, 'src/', { cut: false, paths: ['a.ts', 'b.ts'] });

    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect.poll(() => overwrite.mock.calls.length).toBe(1);
    expect(application.fileTree.clipboard).not.toBeNull();
  });

  test('reports failed entries', async () => {
    const add = vi.spyOn(toast, 'add');
    const application = await mount({
      copyEntries: async () =>
        create(CopyEntriesResponseSchema, {
          failures: [{ relativePath: 'a.ts', reason: CopyReason.OTHER, message: 'denied' }],
        }),
    });
    open(application, 'src/', { cut: false, paths: ['a.ts', 'b.ts'] });

    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'error', title: 'Copying “a.ts” failed', description: 'denied' }),
    );
  });

  test('reports failed entry in dialog', async () => {
    const application = await mount({
      copyEntries: async () =>
        create(CopyEntriesResponseSchema, {
          failures: [
            { relativePath: 'README.md', reason: CopyReason.OTHER, message: 'an entry cannot be moved into itself' },
          ],
        }),
    });
    open(application, 'src/', { cut: false, paths: ['README.md'] });

    await userEvent.click(page.getByRole('button', { name: 'Copy' }));

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not copy “README.md”an entry cannot be moved into itself');
  });

  test('reports failed entries in dialog', async () => {
    const application = await mount();
    const workspace = { ...WORKSPACE, id: { ...WORKSPACE.id, daemon: 'remote' } };
    const clipboard = { cut: true, workspace: workspace.id, paths: ['README.md', 'src/'] };
    application.fileTree.pasteDialog.openWithPayload({ workspace, folder: 'docs/', clipboard });

    await userEvent.click(page.getByRole('button', { name: 'Move' }));

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Could not move 2 files and foldersNo daemon remote.');
  });

  test('completes subfolders', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.fill(page.getByLabelText('To folder'), 'src/l');
    await userEvent.click(page.getByRole('option', { name: 'src/lib/' }));

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
  });

  test('completes first match on tab', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.fill(page.getByLabelText('To folder'), 'src/L');
    await expect.element(page.getByRole('option', { name: 'src/lib/' })).toBeVisible();
    await userEvent.keyboard('{Tab}');

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
    await expect.element(page.getByLabelText('To folder')).toHaveFocus();
  });

  test('completes again after completing', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.fill(page.getByLabelText('To folder'), 's');
    await expect.element(page.getByRole('option', { name: 'src/' })).toBeVisible();
    await userEvent.keyboard('{Tab}');
    await expect.element(page.getByRole('option', { name: 'src/lib/' })).toBeVisible();
    await userEvent.keyboard('{Tab}');

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
    await expect.element(page.getByLabelText('To folder')).toHaveFocus();
  });

  test('completes again after completing', async () => {
    const application = await mount();
    open(application, 'src/', { cut: true, paths: ['README.md', 'a.ts'] });
    await expect.element(page.getByLabelText('To folder')).toHaveFocus();

    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}s');
    await expect.element(page.getByRole('option', { name: 'src/' })).toBeVisible();
    await userEvent.keyboard('{Tab}');
    await expect.element(page.getByRole('option', { name: 'src/lib/' })).toBeVisible();
    await userEvent.keyboard('{Tab}');

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
    await expect.element(page.getByLabelText('To folder')).toHaveFocus();
  });

  test('completes first match on right arrow at end', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.fill(page.getByLabelText('To folder'), 'src/l');
    await expect.element(page.getByRole('option', { name: 'src/lib/' })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
  });

  test('suggests root folders when cleared', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });
    await userEvent.fill(page.getByLabelText('To folder'), 'z');
    await expect.element(page.getByText('New folder “z”')).toBeVisible();

    await userEvent.keyboard('{Backspace}');

    await expect.element(page.getByRole('option', { name: 'src/' })).toBeVisible();
  });

  test('suggests root folders on click', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.click(page.getByLabelText('To folder'));

    await expect.element(page.getByRole('option', { name: 'src/' })).toBeVisible();
  });

  test('moves focus on tab when empty', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });
    await userEvent.click(page.getByLabelText('To folder'));
    await expect.element(page.getByRole('option', { name: 'src/' })).toBeVisible();

    await userEvent.keyboard('{Tab}');

    await expect.element(page.getByLabelText('To folder')).toHaveValue('');
    await expect.element(page.getByLabelText('To folder')).not.toHaveFocus();
  });

  test('marks new folder', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md', 'a.ts'] });

    await userEvent.fill(page.getByLabelText('To folder'), 'src/new');

    await expect.element(page.getByText('New folder “src/new”')).toBeVisible();
  });

  test('hides browse outside desktop app', async () => {
    const application = await mount();
    open(application, '', { cut: true, paths: ['README.md'] });

    await expect.element(page.getByRole('heading', { name: 'Move “README.md” file' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Browse' })).not.toBeInTheDocument();
  });

  test('browses from folder', async () => {
    const pickPaths = vi.fn(async () => ['/elsewise/src/lib']);
    window.bridge = { window: { pickPaths } } as unknown as typeof window.bridge;
    const application = await mount();
    open(application, 'src/', { cut: true, paths: ['README.md'] });

    await userEvent.click(page.getByRole('button', { name: 'Browse' }));

    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/lib/');
    expect(pickPaths).toHaveBeenCalledExactlyOnceWith({
      kind: 'folder',
      defaultPath: '/elsewise/src',
      createFolder: true,
    });
  });

  test('refuses browsed folder outside workspace', async () => {
    window.bridge = { window: { pickPaths: async () => ['/other'] } } as unknown as typeof window.bridge;
    const application = await mount();
    open(application, 'src/', { cut: true, paths: ['README.md'] });

    await userEvent.click(page.getByRole('button', { name: 'Browse' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('Pick a folder in “Singapore”.');
    await expect.element(page.getByLabelText('To folder')).toHaveValue('src/');
  });
});
