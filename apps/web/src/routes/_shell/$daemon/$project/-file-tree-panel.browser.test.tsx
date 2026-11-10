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
import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import {
  DirectoryListing_Entry_Type,
  FileSystemService,
  WatchDirectoriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { GitService } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import {
  GetWorkspacesResponseSchema,
  ProjectService,
  WorkspaceSchema,
} from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { WorkspaceStateStore, WorkspaceStateStoreContext } from '@/projects/workspace-state-store';
import { settingsQuery } from '@/settings/settings';
import { builtInApplication } from '../../../../../test/commands';
import { FileTreePanel } from './-file-tree-panel';

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
function fakeDaemon(): Daemon {
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
      watchStatus: async function* () {},
    },
  };
}

// Renders the panel of Singapore, with the bridge to open a folder so the context menu has an item.
async function mount() {
  window.bridge = {
    window: {
      cut() {},
      copy() {},
      paste() {},
      openFolder: async () => {},
      pickFolder: async () => null,
      pickFile: async () => null,
      setBrightness() {},
      setBackground() {},
      onClose() {},
    },
  };
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, fakeDaemon());
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
  await render(
    <QueryClientProvider client={client}>
      <ApplicationManagerContext value={builtInApplication({ router })}>
        <WorkspaceStateStoreContext value={new WorkspaceStateStore(undefined)}>
          <RouterProvider router={router} />
        </WorkspaceStateStoreContext>
      </ApplicationManagerContext>
    </QueryClientProvider>,
  );
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
});
