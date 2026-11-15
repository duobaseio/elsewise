import { create } from '@bufbuild/protobuf';
import { toast } from '@elsewise/components/components/toast';
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
  CopyEntriesResponseSchema,
  DirectoryListing_Entry_Type,
  FileSystemService,
  MoveEntriesResponse_Failure_Reason as MoveEntriesReason,
  MoveEntriesResponseSchema,
  WatchDirectoriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import {
  GitService,
  MoveResponse_Failure_Reason as MoveReason,
  MoveResponseSchema,
} from '@/gen/elsewise/daemon/git/v1/git_service_pb';
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
const SOURCES = ['c.ts', 'd.ts'];

afterEach(() => {
  window.bridge = undefined;
  vi.restoreAllMocks();
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

// A daemon with the workspace Singapore at /elsewise, which holds the folder src with `SOURCES`, `NAMES`, and no git
// changes.
function fakeDaemon(git: Partial<Daemon['git']>, fileSystem: Partial<Daemon['fileSystem']>): Daemon {
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
      ...fileSystem,
      watchDirectories: () => ({
        send: async () => {},
        close() {},
        cancel() {},
        responses: (async function* () {
          yield create(WatchDirectoriesResponseSchema, {
            relativePath: '',
            state: {
              case: 'listing',
              value: {
                entries: [
                  { name: 'src', type: DirectoryListing_Entry_Type.DIRECTORY },
                  ...NAMES.map((name) => ({ name, type: DirectoryListing_Entry_Type.FILE })),
                ],
              },
            },
          });
          yield create(WatchDirectoriesResponseSchema, {
            relativePath: 'src',
            state: {
              case: 'listing',
              value: { entries: SOURCES.map((name) => ({ name, type: DirectoryListing_Entry_Type.FILE })) },
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

// Renders the panel of Singapore with src open, with the bridge to open a folder so the context menu has an item and to
// find dropped files in /downloads, and returns the application it runs in.
async function mount(
  git: Partial<Daemon['git']> = {},
  fileSystem: Partial<Daemon['fileSystem']> = {},
  daemon = LOCAL_DAEMON_ID,
): Promise<ApplicationManager> {
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      absolutePathOf: (file) => `/downloads/${file.name}`,
      showPath: async () => {},
      pickPaths: async () => [],
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(daemon).queryKey, fakeDaemon(git, fileSystem));
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
    history: createMemoryHistory({ initialEntries: [`/${daemon}/elsewise/singapore`] }),
  });
  const application = builtInApplication({ router });
  const store = new WorkspaceStateStore(undefined);
  store.update({ ...WORKSPACE, daemon }, { fileTree: { expanded: ['src/'], selected: [] } });
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={application}>
        <WorkspaceStateStoreContext value={store}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
  return application;
}

// Drags z.ts from /downloads over the element and drops it there, holding Option if `alt`.
function dropFile(element: Element | null | undefined, { drop = true, alt = false } = {}) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File(['z'], 'z.ts'));
  for (const type of drop ? ['dragover', 'drop'] : ['dragover']) {
    element?.dispatchEvent(
      new DragEvent(type, { bubbles: true, composed: true, cancelable: true, altKey: alt, dataTransfer }),
    );
  }
}

function shadowRow(path: string): Element | null | undefined {
  return document.querySelector('file-tree-container')?.shadowRoot?.querySelector(`[data-item-path="${path}"]`);
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
      .toEqual([
        [{ absolutePath: '/elsewise', entries: [{ relativePath: 'a.ts', newRelativePath: 'z.ts' }], overwrite: false }],
      ]);
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
    const add = vi.spyOn(toast, 'add');
    const application = await mount({
      move: async () =>
        create(MoveResponseSchema, {
          failures: [{ relativePath: 'a.ts', reason: MoveReason.OTHER, message: 'denied' }],
        }),
    });
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
    expect(add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'error', title: 'Renaming failed', description: 'denied' }),
    );
  });

  test('moves into folder through git', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => move.mock.calls)
      .toEqual([
        [
          {
            absolutePath: '/elsewise',
            entries: [{ relativePath: 'a.ts', newRelativePath: 'src/a.ts' }],
            overwrite: false,
          },
        ],
      ]);
  });

  test('moves row before daemon replies', async () => {
    await mount({ move: () => new Promise(() => {}) });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    const shadow = document.querySelector('file-tree-container')?.shadowRoot;
    expect([
      shadow?.querySelector('[data-item-path="a.ts"]') !== null,
      shadow?.querySelector('[data-item-path="src/a.ts"]') !== null,
    ]).toEqual([false, true]);
  });

  test('moves row to root before daemon replies', async () => {
    await mount({ move: () => new Promise(() => {}) });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(page.getByRole('treeitem', { name: 'd.ts' }), page.getByRole('tree'), {
      targetPosition: { x: 150, y: 380 },
    });

    const shadow = document.querySelector('file-tree-container')?.shadowRoot;
    await expect
      .poll(() => [
        shadow?.querySelector('[data-item-path="src/d.ts"]') !== null,
        shadow?.querySelector('[data-item-path="d.ts"]') !== null,
      ])
      .toEqual([false, true]);
  });

  test('tints tree while dragging over empty space', async () => {
    await mount();
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();
    const host = document.querySelector('file-tree-container');
    const shadow = host?.shadowRoot;
    const dataTransfer = new DataTransfer();
    const fire = (type: string, element: Element | null | undefined) =>
      element?.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer }));
    const tinted = () => host?.hasAttribute('data-drop-target');

    fire('dragstart', shadow?.querySelector('[data-item-path="src/d.ts"]'));
    fire('dragover', shadow?.elementFromPoint(150, 380));
    await expect.poll(tinted).toBe(true);
    fire('dragover', shadow?.querySelector('[data-item-path="a.ts"]'));
    await expect.poll(tinted).toBe(false);
    fire('dragover', shadow?.elementFromPoint(150, 380));
    await expect.poll(tinted).toBe(true);
    fire('dragend', shadow?.querySelector('[data-item-path="src/d.ts"]'));
    await expect.poll(tinted).toBe(false);
  });

  test('moves to root onto root file', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'd.ts' }),
      page.getByRole('treeitem', { name: 'a.ts' }),
    );

    await expect
      .poll(() => move.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: 'src/d.ts', newRelativePath: 'd.ts' }]]);
  });

  test('moves to root from empty space', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(page.getByRole('treeitem', { name: 'd.ts' }), page.getByRole('tree'), {
      targetPosition: { x: 150, y: 380 },
    });

    await expect
      .poll(() => move.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: 'src/d.ts', newRelativePath: 'd.ts' }]]);
  });

  test('keeps root entry in root', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(page.getByRole('treeitem', { name: 'a.ts' }), page.getByRole('tree'), {
      targetPosition: { x: 150, y: 380 },
    });
    await userEvent.dragAndDrop(page.getByRole('treeitem', { name: 'd.ts' }), page.getByRole('tree'), {
      targetPosition: { x: 150, y: 380 },
    });

    await expect
      .poll(() => move.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: 'src/d.ts', newRelativePath: 'd.ts' }]]);
  });

  test('ignores drop into itself', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'src' }),
      page.getByRole('treeitem', { name: 'd.ts' }),
    );
    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => move.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: 'a.ts', newRelativePath: 'src/a.ts' }]]);
  });

  test('moves selection in one request', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () => create(MoveResponseSchema));
    await mount({ move });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();
    await userEvent.click(page.getByRole('treeitem', { name: 'a.ts' }));
    await userEvent.click(page.getByRole('treeitem', { name: 'b.ts' }), { modifiers: ['Shift'] });

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => move.mock.calls.map(([request]) => request.entries))
      .toEqual([
        [
          { relativePath: 'a.ts', newRelativePath: 'src/a.ts' },
          { relativePath: 'b.ts', newRelativePath: 'src/b.ts' },
        ],
      ]);
  });

  test('moves clipboard path on drop', async () => {
    const application = await mount({ move: async () => create(MoveResponseSchema) });
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE, paths: ['a.ts', 'b.ts'] };
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect.poll(() => application.fileTree.clipboard?.paths).toEqual(['src/a.ts', 'b.ts']);
  });

  test('reports failed drop', async () => {
    const add = vi.spyOn(toast, 'add');
    await mount({
      move: async () =>
        create(MoveResponseSchema, {
          failures: [{ relativePath: 'a.ts', reason: MoveReason.OTHER, message: 'denied' }],
        }),
    });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => add.mock.calls)
      .toEqual([[expect.objectContaining({ type: 'error', title: 'Moving “a.ts” failed', description: 'denied' })]]);
    const shadow = document.querySelector('file-tree-container')?.shadowRoot;
    expect([
      shadow?.querySelector('[data-item-path="a.ts"]') !== null,
      shadow?.querySelector('[data-item-path="src/a.ts"]') !== null,
    ]).toEqual([true, false]);
  });

  test('confirms overwrite of existing entry', async () => {
    const application = await mount({
      move: async () =>
        create(MoveResponseSchema, { failures: [{ relativePath: 'a.ts', reason: MoveReason.ALREADY_EXISTS }] }),
    });
    const open = vi.spyOn(application.fileTree.overwriteDialog, 'openWithPayload');
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'a.ts' }),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => open.mock.calls)
      .toEqual([
        [
          expect.objectContaining({
            folder: 'src',
            cut: true,
            entries: [{ source: 'a.ts', destination: 'src/a.ts', folder: false }],
          }),
        ],
      ]);
  });

  test('confirms overwrite of listed entry', async () => {
    const application = await mount({
      move: async () =>
        create(MoveResponseSchema, { failures: [{ relativePath: 'c.ts', reason: MoveReason.ALREADY_EXISTS }] }),
    });
    const open = vi.spyOn(application.fileTree.overwriteDialog, 'openWithPayload');
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    await userEvent.dragAndDrop(
      page.getByRole('treeitem', { name: 'c.ts' }).last(),
      page.getByRole('treeitem', { name: 'src' }),
    );

    await expect
      .poll(() => open.mock.calls)
      .toEqual([
        [
          expect.objectContaining({
            entries: [{ source: 'c.ts', destination: 'src/c.ts', folder: false }],
          }),
        ],
      ]);
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

  test.each([
    ['folder', 'src/', 'src/z.ts'],
    ['file parent', 'src/d.ts', 'src/z.ts'],
    ['root file parent', 'a.ts', 'z.ts'],
  ])('moves dropped file into %s', async (_, path, destination) => {
    const moveEntries = vi.fn<Daemon['fileSystem']['moveEntries']>(async () => create(MoveEntriesResponseSchema));
    await mount({}, { moveEntries });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(shadowRow(path));

    await expect
      .poll(() => moveEntries.mock.calls)
      .toEqual([
        [
          {
            root: '',
            entries: [{ relativePath: '/downloads/z.ts', newRelativePath: `/elsewise/${destination}` }],
            overwrite: false,
          },
        ],
      ]);
  });

  test('moves dropped file into root from empty space', async () => {
    const moveEntries = vi.fn<Daemon['fileSystem']['moveEntries']>(async () => create(MoveEntriesResponseSchema));
    await mount({}, { moveEntries });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(document.querySelector('file-tree-container')?.shadowRoot?.elementFromPoint(150, 380));

    await expect
      .poll(() => moveEntries.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: '/downloads/z.ts', newRelativePath: '/elsewise/z.ts' }]]);
  });

  test('copies dropped file with Option', async () => {
    const copyEntries = vi.fn<Daemon['fileSystem']['copyEntries']>(async () => create(CopyEntriesResponseSchema));
    await mount({}, { copyEntries });
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(shadowRow('src/'), { alt: true });

    await expect
      .poll(() => copyEntries.mock.calls.map(([request]) => request.entries))
      .toEqual([[{ relativePath: '/downloads/z.ts', newRelativePath: '/elsewise/src/z.ts' }]]);
  });

  test('selects dropped entry', async () => {
    await mount({}, { moveEntries: async () => create(MoveEntriesResponseSchema) });
    await userEvent.click(page.getByRole('treeitem', { name: 'a.ts' }));

    dropFile(shadowRow('src/'));

    await expect.element(page.getByRole('treeitem', { name: 'z.ts' })).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByRole('treeitem', { name: 'a.ts' })).toHaveAttribute('aria-selected', 'false');
  });

  test('confirms overwrite of dropped file', async () => {
    const application = await mount(
      {},
      {
        moveEntries: async () =>
          create(MoveEntriesResponseSchema, {
            failures: [{ relativePath: '/downloads/z.ts', reason: MoveEntriesReason.ALREADY_EXISTS }],
          }),
      },
    );
    const open = vi.spyOn(application.fileTree.overwriteDialog, 'openWithPayload');
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(shadowRow('src/'));

    await expect
      .poll(() => open.mock.calls)
      .toEqual([
        [
          expect.objectContaining({
            folder: 'src',
            cut: true,
            entries: [{ source: '/downloads/z.ts', destination: 'src/z.ts', folder: false, absolute: true }],
          }),
        ],
      ]);
  });

  test('reports failed file drop', async () => {
    const add = vi.spyOn(toast, 'add');
    await mount(
      {},
      {
        moveEntries: async () =>
          create(MoveEntriesResponseSchema, {
            failures: [
              {
                relativePath: '/downloads/z.ts',
                reason: MoveEntriesReason.OTHER,
                message: 'denied',
              },
            ],
          }),
      },
    );
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(shadowRow('src/'));

    await expect
      .poll(() => add.mock.calls)
      .toEqual([[expect.objectContaining({ type: 'error', title: 'Moving “z.ts” failed', description: 'denied' })]]);
  });

  test('tints folder while dragging file over its child', async () => {
    await mount();
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();
    const background = (path: string) => {
      const row = shadowRow(path);
      return row ? getComputedStyle(row).backgroundColor : undefined;
    };
    const untinted = background('a.ts');

    dropFile(shadowRow('src/d.ts'), { drop: false });

    await expect.poll(() => background('src/')).not.toBe(untinted);
    expect(document.querySelector('file-tree-container')?.hasAttribute('data-drop-target')).toBe(false);
  });

  test('ignores file drop on other daemon', async () => {
    const moveEntries = vi.fn<Daemon['fileSystem']['moveEntries']>(async () => create(MoveEntriesResponseSchema));
    await mount({}, { moveEntries }, 'remote');
    await expect.element(page.getByRole('treeitem', { name: 'd.ts' })).toBeVisible();

    dropFile(shadowRow('src/'));
    await new Promise(requestAnimationFrame);

    expect(moveEntries).not.toHaveBeenCalled();
  });
});
