import { create } from '@bufbuild/protobuf';
import type { Workspace } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  CreateDirectoryResponseSchema,
  WriteFileResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { NewEntryDialog } from './new-entry-dialog';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

// Renders the dialog over a daemon whose writeFile and createDirectory are given, and returns the application to open
// it with.
async function mount({
  writeFile = async () => create(WriteFileResponseSchema),
  createDirectory = async () => create(CreateDirectoryResponseSchema),
}: {
  writeFile?: Daemon['fileSystem']['writeFile'];
  createDirectory?: Daemon['fileSystem']['createDirectory'];
} = {}): Promise<ApplicationManager> {
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, {
    fileSystem: { writeFile, createDirectory },
  } as unknown as Daemon);
  const application = builtInApplication();
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <NewEntryDialog />
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

function open(application: ApplicationManager, folder: string, kind: 'file' | 'folder') {
  application.fileTree.newDialog.openWithPayload({ workspace: WORKSPACE, folder, kind });
}

describe('NewEntryDialog', () => {
  test('creates file', async () => {
    const writeFile = vi.fn<Daemon['fileSystem']['writeFile']>(async () => create(WriteFileResponseSchema));
    const application = await mount({ writeFile });
    open(application, 'src/', 'file');

    await expect.element(page.getByRole('heading', { name: 'New file in “src”' })).toBeVisible();
    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(writeFile.mock.calls).toEqual([[{ root: '/elsewise', relativePath: 'src/notes.md' }]]);
  });

  test('creates folder in root on enter', async () => {
    const createDirectory = vi.fn<Daemon['fileSystem']['createDirectory']>(async () =>
      create(CreateDirectoryResponseSchema),
    );
    const application = await mount({ createDirectory });
    open(application, '', 'folder');

    await expect.element(page.getByRole('heading', { name: 'New folder in “Singapore”' })).toBeVisible();
    await userEvent.fill(page.getByLabelText('Name'), 'docs');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(createDirectory.mock.calls).toEqual([[{ root: '/elsewise', relativePath: 'docs' }]]);
  });

  test('creates nested path', async () => {
    const writeFile = vi.fn<Daemon['fileSystem']['writeFile']>(async () => create(WriteFileResponseSchema));
    const application = await mount({ writeFile });
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), '/lib//util/index.ts');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(writeFile.mock.calls).toEqual([[{ root: '/elsewise', relativePath: 'src/lib/util/index.ts' }]]);
  });

  test('refuses backslash', async () => {
    const writeFile = vi.fn<Daemon['fileSystem']['writeFile']>(async () => create(WriteFileResponseSchema));
    const application = await mount({ writeFile });
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), 'lib\\index.ts');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('Names cannot contain “\\”.');
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('disables create without name', async () => {
    const application = await mount();
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), '  ');

    await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('reports existing entry', async () => {
    const application = await mount({
      writeFile: async () => {
        throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the path');
      },
    });
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('“notes.md” already exists in “src”.');
    await expect.element(page.getByRole('dialog')).toBeVisible();
  });

  test('reports failure', async () => {
    const application = await mount({
      createDirectory: async () => {
        throw new TransportError(Code.PERMISSION_DENIED, 'denied');
      },
    });
    open(application, 'src/', 'folder');

    await userEvent.fill(page.getByLabelText('Name'), 'docs');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));

    await expect.element(page.getByRole('alert')).toHaveTextContent('Could not create “docs”denied');
  });

  test('resets form for each opening', async () => {
    const application = await mount();
    open(application, 'src/', 'file');
    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

    open(application, 'lib/', 'folder');

    await expect.element(page.getByRole('heading', { name: 'New folder in “lib”' })).toBeVisible();
    await expect.element(page.getByLabelText('Name')).toHaveValue('');
  });

  test('cancels', async () => {
    const writeFile = vi.fn<Daemon['fileSystem']['writeFile']>(async () => create(WriteFileResponseSchema));
    const application = await mount({ writeFile });
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('switches to file for file name', async () => {
    const writeFile = vi.fn<Daemon['fileSystem']['writeFile']>(async () => create(WriteFileResponseSchema));
    const createDirectory = vi.fn<Daemon['fileSystem']['createDirectory']>(async () =>
      create(CreateDirectoryResponseSchema),
    );
    const application = await mount({ writeFile, createDirectory });
    open(application, 'src/', 'folder');

    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await expect.element(page.getByText(/Did you mean to/)).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'create a file' }));

    await expect.element(page.getByRole('heading', { name: 'New file in “src”' })).toBeVisible();
    await expect.element(page.getByLabelText('Name')).toHaveValue('notes.md');
    await userEvent.click(page.getByRole('button', { name: 'Create' }));
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(writeFile.mock.calls).toEqual([[{ root: '/elsewise', relativePath: 'src/notes.md' }]]);
    expect(createDirectory).not.toHaveBeenCalled();
  });

  test('creates folder for file name on enter', async () => {
    const createDirectory = vi.fn<Daemon['fileSystem']['createDirectory']>(async () =>
      create(CreateDirectoryResponseSchema),
    );
    const application = await mount({ createDirectory });
    open(application, 'src/', 'folder');

    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(createDirectory.mock.calls).toEqual([[{ root: '/elsewise', relativePath: 'src/notes.md' }]]);
  });

  test('omits hint for folder names', async () => {
    const application = await mount();
    open(application, 'src/', 'folder');

    for (const name of ['.github', 'v1.2', 'docs', 'notes.md/']) {
      await userEvent.fill(page.getByLabelText('Name'), name);
      await expect.element(page.getByLabelText('Name')).toHaveValue(name);
      expect(page.getByText(/Did you mean to/).query()).toBeNull();
    }
  });

  test('omits hint for new file', async () => {
    const application = await mount();
    open(application, 'src/', 'file');

    await userEvent.fill(page.getByLabelText('Name'), 'notes.md');
    await expect.element(page.getByLabelText('Name')).toHaveValue('notes.md');

    expect(page.getByText(/Did you mean to/).query()).toBeNull();
  });
});
