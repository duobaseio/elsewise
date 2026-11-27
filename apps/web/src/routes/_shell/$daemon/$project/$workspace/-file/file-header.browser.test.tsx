import { create } from '@bufbuild/protobuf';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { DockviewPanelApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { FileHandle } from '@/fs/file-handle';
import { Change } from '@/gen/elsewise/daemon/git/v1/git_pb';
import { WatchStatusResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { builtInApplication } from '../../../../../../../test/commands';
import { fakeFileSystem } from '../../../../../../../test/fake-file-system';
import { FileHeader, fileTooltip } from './file-header';

const WORKSPACE = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };

// Renders the header of main.ts in the workspace Singapore, and returns the application it runs in and a handle of the
// file, which is not open yet.
async function mount() {
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <FileHeader api={{ id: 'file:1', title: 'main.ts' } as DockviewPanelApi} params={{ path: 'main.ts' }} />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: ['/local/elsewise/singapore'] }),
  });
  const application = builtInApplication({ router });
  await render(
    <ApplicationManagerContext value={application}>
      <RouterProvider router={router} />
    </ApplicationManagerContext>,
  );
  await expect.element(page.getByText('main.ts')).toBeVisible();
  return { application, file: new FileHandle(fakeFileSystem().fileSystem, '/elsewise', 'main.ts') };
}

// Gives main.ts the git status `kind` in `workspace`, and returns once the application has it.
async function watch(application: ApplicationManager, kind: 'modified' | 'ignored', workspace = WORKSPACE) {
  application.git.watch(
    {
      watchStatus: async function* () {
        yield create(WatchStatusResponseSchema, {
          status: {
            entries: [
              {
                relativePath: 'main.ts',
                kind:
                  kind === 'modified'
                    ? { case: 'changed', value: { unstaged: Change.MODIFIED } }
                    : { case: 'ignored', value: {} },
              },
            ],
          },
        });
        await new Promise(() => {});
      },
    },
    workspace,
    '/elsewise',
  );
  await vi.waitFor(() => expect(application.git.get(workspace, 'main.ts')).toBe(kind));
  await new Promise(requestAnimationFrame);
}

function color(): string {
  return getComputedStyle(page.getByText('main.ts').element()).color;
}

function marked(): boolean {
  return page.getByRole('img', { name: 'Unsaved changes' }).elements().length > 0;
}

describe('FileHeader', () => {
  test('marks file with unsaved changes', async () => {
    const { application, file } = await mount();
    application.files.add(WORKSPACE, file);

    file.document = () => '';

    await expect.poll(marked).toBe(true);
  });

  test('unmarks file once it has no unsaved changes', async () => {
    const { application, file } = await mount();
    application.files.add(WORKSPACE, file);
    file.document = () => '';
    await expect.poll(marked).toBe(true);

    file.document = null;

    await expect.poll(marked).toBe(false);
  });

  test('marks file that opens with unsaved changes', async () => {
    const { application, file } = await mount();
    file.document = () => '';

    application.files.add(WORKSPACE, file);

    await expect.poll(marked).toBe(true);
  });

  test('closes panel through dock', async () => {
    const { application } = await mount();
    const panel = { id: 'file:1', type: 'file', tab: true, closable: true, relativePath: 'main.ts' };
    const close = vi.fn(async () => true);
    application.docks.active = { get: () => panel, close } as never;

    await page.getByRole('button', { name: 'Close main.ts' }).click();

    expect(close).toHaveBeenCalledExactlyOnceWith(panel);
  });

  test('ignores file of other workspace', async () => {
    const { application, file } = await mount();
    file.document = () => '';

    application.files.add({ ...WORKSPACE, workspace: 'other' }, file);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(marked()).toBe(false);
  });

  test('colours title of modified file', async () => {
    const { application } = await mount();
    const probe = document.createElement('span');
    probe.style.color = 'var(--info)';
    document.body.append(probe);

    await watch(application, 'modified');

    expect(color()).toBe(getComputedStyle(probe).color);
  });

  test('keeps title colour of ignored file', async () => {
    const { application } = await mount();
    const before = color();

    await watch(application, 'ignored');

    expect(color()).toBe(before);
  });

  test('ignores status of other workspace', async () => {
    const { application } = await mount();
    const before = color();

    await watch(application, 'modified', { ...WORKSPACE, workspace: 'other' });

    expect(color()).toBe(before);
  });
});

describe('fileTooltip', () => {
  test('returns absolute path', async () => {
    const application = builtInApplication();
    vi.spyOn(application.projects.workspaces, 'active', 'get').mockReturnValue({
      id: WORKSPACE,
      name: 'singapore',
      state: 'ok',
      main: false,
      absolutePath: '/home/elsewise',
    });

    await render(
      fileTooltip(application, {} as never, {
        id: 'file:1',
        type: 'file',
        tab: true,
        closable: true,
        relativePath: 'src/main.ts',
      }),
    );

    await expect.element(page.getByText('/home/elsewise/src/main.ts', { exact: true })).toBeVisible();
  });
});
