import { create } from '@bufbuild/protobuf';
import { EditorView } from '@codemirror/view';
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
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { type Daemon, daemonQuery, LOCAL_DAEMON_ID } from '@/daemon';
import { EDITOR_UNIFIED_DIFF } from '@/editor/diff/commands';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { GetWorkspacesResponseSchema, WorkspaceSchema } from '@/gen/elsewise/daemon/project/v1/project_service_pb';
import { PluginStore, PluginStoreContext } from '@/plugins/plugin-store';
import { settingsQuery } from '@/settings/settings';
import { builtInApplication } from '../../../../../../../test/commands';
import { fakeFileSystem } from '../../../../../../../test/fake-file-system';
import { FilePanel } from './file-panel';

// Renders the panel of main.ts in the workspace Singapore at /elsewise, and returns the file system it reads from and
// the parameters it keeps.
async function mount(content: string | Uint8Array) {
  const fake = fakeFileSystem();
  fake.put('main.ts', content);
  const updateParameters = vi.fn();
  const client = new QueryClient();
  client.setQueryData(daemonQuery(LOCAL_DAEMON_ID).queryKey, {
    fileSystem: fake.fileSystem,
    projects: {
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
  } as unknown as Daemon);
  client.setQueryData(settingsQuery.queryKey, DEFAULT_FRONTEND_SETTINGS);

  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <div style={{ width: 600, height: 300 }}>
        <FilePanel
          {...({ params: { path: 'main.ts' }, api: { updateParameters } } as unknown as IDockviewPanelProps<{
            path: string;
          }>)}
        />
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([shell.addChildren([workspace])]),
    history: createMemoryHistory({ initialEntries: [`/${LOCAL_DAEMON_ID}/elsewise/singapore`] }),
  });
  const application = builtInApplication({ router });
  const screen = await render(
    <QueryClientProvider client={client}>
      <PluginStoreContext value={new PluginStore()}>
        <ApplicationManagerContext value={application}>
          <LanguageServersContext value={new LanguageServers(application.editor)}>
            <RouterProvider router={router} />
          </LanguageServersContext>
        </ApplicationManagerContext>
      </PluginStoreContext>
    </QueryClientProvider>,
  );
  fake.report('main.ts');
  return { application, fake, screen, updateParameters };
}

function editor(container: Element): EditorView {
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('missing editor');
  }
  return view;
}

describe('FilePanel', () => {
  test('shows text of file', async () => {
    await mount('let a;\n');

    await expect.element(page.getByText('let a;')).toBeVisible();
  });

  test('shows message for binary file', async () => {
    await mount(new Uint8Array([0, 1]));

    await expect.element(page.getByText('The file is not text.')).toBeVisible();
  });

  test('applies change on disk to clean editor', async () => {
    const { fake } = await mount('let a;\n');
    await expect.element(page.getByText('let a;')).toBeVisible();

    fake.put('main.ts', 'let z;\n');
    fake.report('main.ts');

    await expect.element(page.getByText('let z;')).toBeVisible();
  });

  test('keeps unsaved changes on change on disk', async () => {
    const { fake, screen } = await mount('let a;\n');
    await expect.element(page.getByText('let a;')).toBeVisible();
    const view = editor(screen.container);
    view.dispatch({ changes: { from: 4, to: 5, insert: 'b' } });

    fake.put('main.ts', 'let z;\n');
    fake.report('main.ts');

    await expect.poll(() => fake.reads).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(editor(screen.container)).toBe(view);
    expect(view.state.doc.toString()).toBe('let b;\n');
  });

  test('keeps comparison in view parameters', async () => {
    const { application, screen, updateParameters } = await mount('let a;\n');
    await expect.element(page.getByText('let a;')).toBeVisible();

    EDITOR_UNIFIED_DIFF.run(application, editor(screen.container));

    expect(updateParameters).toHaveBeenCalledWith({ view: { type: 'editor', diff: null, layout: 'unified' } });
  });

  test('adds handle of file while mounted', async () => {
    const { application, screen } = await mount('let a;\n');
    await expect.element(page.getByText('let a;')).toBeVisible();
    const workspace = { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' };

    editor(screen.container).dispatch({ changes: { from: 4, to: 5, insert: 'b' } });

    expect(application.files.get(workspace, 'main.ts')?.document).not.toBeNull();
    await screen.unmount();
    expect(application.files.get(workspace, 'main.ts')).toBeNull();
  });
});
