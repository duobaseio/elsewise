import { create } from '@bufbuild/protobuf';
import { DEFAULT_FRONTEND_SETTINGS } from '@elsewise/frontend-plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { IDockviewPanelProps } from 'dockview-react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  DirectoryListing_Entry_Type,
  FileSystemService,
  WatchDirectoriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { GitService, MoveResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import {
  GetWorkspacesResponseSchema,
  ProjectService,
  WorkspaceSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { settingsQuery } from '@/settings/settings';
import { builtInApplication } from '../../../../../../../test/commands';
import { FileTreePanel } from './file-tree-panel';

const WORKSPACE = { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' };
const NAMES = ['a.ts', 'b.ts', 'c.ts'];

afterEach(() => {
  window.bridge = undefined;
});

function unused(service: { methods: readonly { localName: string }[] }) {
  return Object.fromEntries(
    service.methods.map((method) => [
      method.localName,
      () => {
        throw new Error('not faked');
      },
    ]),
  );
}

// A daemon with the workspace Singapore at /elsewise, which holds `NAMES` and no git changes.
function fakeDaemon(git: Partial<Daemon['git']>): Daemon {
  return {
    projects: {
      ...(unused(ProjectService) as unknown as Daemon['projects']),
      getWorkspaces: async () =>
        create(GetWorkspacesResponseSchema, {
          workspaces: [
            create(WorkspaceSchema, {
              projectId: 'elsewise',
              id: 'singapore',
              name: 'Singapore',
              absolutePath: '/elsewise',
              state: { case: 'ok', value: { branch: 'main' } },
            }),
          ],
        }),
    },
    fileSystem: {
      ...(unused(FileSystemService) as unknown as Daemon['fileSystem']),
      watchDirectories: () => ({
        send: async () => {},
        close() {},
        cancel() {},
        responses: (async function* () {
          yield create(WatchDirectoriesResponseSchema, {
            relativePath: '',
            state: {
              case: 'listing',
              value: { entries: NAMES.map((name) => ({ name, type: DirectoryListing_Entry_Type.FILE })) },
            },
          });
          await new Promise(() => {});
        })(),
      }),
    },
    git: {
      ...(unused(GitService) as unknown as Daemon['git']),
      ...git,
      watchStatus: async function* () {},
    },
  };
}

// Renders the panel of Singapore, with the bridge to open a folder so the context menu has an item, and returns the
// application it runs in.
async function mount(git: Partial<Daemon['git']> = {}): Promise<ApplicationManager> {
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      showPath: async () => {},
      pickPaths: async () => [],
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, fakeDaemon(git));
  client.setQueryData(settingsQuery.queryKey, DEFAULT_FRONTEND_SETTINGS);
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <div style={{ width: 300, height: 400 }}>
        <FileTreePanel {...({} as IDockviewPanelProps<{ path: string }>)} />
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: ['/local/elsewise/singapore'] }),
  });
  const application = builtInApplication({ router });
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

function nameColor(path: string): string | undefined {
  const name = document
    .querySelector('file-tree-container')
    ?.shadowRoot?.querySelector(`[data-item-path="${path}"] > [data-item-section="content"]`);
  return name ? getComputedStyle(name).color : undefined;
}

describe('FileTreePanel', () => {
  test('refocuses row after Escape', async () => {
    await mount();
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await expect.element(row).toBeVisible();

    await userEvent.click(row, { button: 'right' });
    await expect.element(page.getByRole('menu').first()).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');

    await expect
      .poll(() =>
        document.querySelector('file-tree-container')?.shadowRoot?.activeElement?.getAttribute('data-item-path'),
      )
      .toBe('b.ts');
  });

  test('targets root from empty space', async () => {
    const application = await mount();
    const open = vi.spyOn(application.fileTree.newDialog, 'openWithPayload');
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await userEvent.click(row);

    await userEvent.click(page.getByRole('tree'), { button: 'right', position: { x: 150, y: 380 } });

    await expect.element(page.getByRole('menuitem', { name: /Paste/ })).toBeVisible();
    await expect.element(page.getByRole('menuitem', { name: /Cut/ })).not.toBeInTheDocument();
    await expect.element(page.getByRole('menuitem', { name: /Open in/ })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'New' }));
    await userEvent.click(page.getByRole('menuitem', { name: /File/ }));
    expect(open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ folder: '', kind: 'file' }));
    await expect.element(row).toHaveAttribute('aria-selected', 'false');
  });

  test('cancels cut on Escape', async () => {
    const application = await mount();
    application.fileTree.clipboard = { cut: true, workspace: WORKSPACE, paths: ['a.ts'] };
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await userEvent.click(row);

    await userEvent.keyboard('{Escape}');

    await expect.poll(() => application.fileTree.clipboard).toBeNull();
  });

  test('renames through git', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await expect.element(row).toBeVisible();

    await userEvent.click(row, { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: /Rename/ }));
    await userEvent.fill(page.getByRole('textbox'), 'z.ts');
    await userEvent.keyboard('{Enter}');

    await expect
      .poll(() => move.mock.calls)
      .toEqual([[{ absolutePath: '/elsewise', relativePath: 'a.ts', newRelativePath: 'z.ts' }]]);
  });

  test('moves clipboard path on rename', async () => {
    const application = await mount({ move: async () => create(MoveResponseSchema) });
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE, paths: ['a.ts', 'b.ts'] };
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await expect.element(row).toBeVisible();

    await userEvent.click(row, { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: /Rename/ }));
    await userEvent.fill(page.getByRole('textbox'), 'z.ts');
    await userEvent.keyboard('{Enter}');

    await expect.poll(() => application.fileTree.clipboard?.paths).toEqual(['z.ts', 'b.ts']);
  });

  test('restores row when rename fails', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => {
      throw new Error('denied');
    });
    const application = await mount({ move });
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE, paths: ['a.ts'] };
    const row = page.getByRole('treeitem', { name: 'a.ts' });
    await expect.element(row).toBeVisible();

    await userEvent.click(row, { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: /Rename/ }));
    await userEvent.fill(page.getByRole('textbox'), 'z.ts');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
    await expect.element(page.getByRole('treeitem', { name: 'z.ts' })).not.toBeInTheDocument();
    expect(application.fileTree.clipboard?.paths).toEqual(['a.ts']);
  });

  test('dims cut row', async () => {
    const application = await mount();
    await expect.element(page.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();

    application.fileTree.clipboard = { cut: true, workspace: WORKSPACE, paths: ['a.ts'] };

    await expect.poll(() => nameColor('a.ts')).not.toBe(nameColor('b.ts'));
  });

  test('keeps copied row', async () => {
    const application = await mount();
    await expect.element(page.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();

    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE, paths: ['a.ts'] };
    await new Promise(requestAnimationFrame);

    expect(nameColor('a.ts')).toBe(nameColor('b.ts'));
  });
});
