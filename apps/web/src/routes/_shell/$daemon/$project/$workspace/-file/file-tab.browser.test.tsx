import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { FileHandle } from '@/fs/file-handle';
import { builtInApplication } from '../../../../../../../test/commands';
import { fakeFileSystem } from '../../../../../../../test/fake-file-system';
import { FileTab } from './file-tab';

const WORKSPACE = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };

// Renders the tab of main.ts in the workspace Singapore, and returns the application it runs in and a handle of the
// file, which is not open yet.
async function mount() {
  const root = createRootRoute();
  const shell = createRoute({ getParentRoute: () => root, id: '_shell' });
  const workspace = createRoute({
    getParentRoute: () => shell,
    path: '$daemon/$project/$workspace',
    component: () => (
      <FileTab
        {...({
          api: { id: 'file:1', title: 'main.ts' },
          containerApi: {
            panels: [],
            onDidAddPanel: () => ({ dispose() {} }),
            onDidRemovePanel: () => ({ dispose() {} }),
          },
          params: { path: 'main.ts' },
        } as unknown as IDockviewPanelHeaderProps<{ path: string }>)}
      />
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

function marked(): boolean {
  return document.querySelector('[data-dirty]') !== null;
}

describe('FileTab', () => {
  test('marks tab of file with unsaved changes', async () => {
    const { application, file } = await mount();
    application.files.add(WORKSPACE, file);

    file.dirty = true;

    await expect.poll(marked).toBe(true);
  });

  test('unmarks tab once file has no unsaved changes', async () => {
    const { application, file } = await mount();
    application.files.add(WORKSPACE, file);
    file.dirty = true;
    await expect.poll(marked).toBe(true);

    file.dirty = false;

    await expect.poll(marked).toBe(false);
  });

  test('marks tab of file that opens with unsaved changes', async () => {
    const { application, file } = await mount();
    file.dirty = true;

    application.files.add(WORKSPACE, file);

    await expect.poll(marked).toBe(true);
  });

  test('ignores file of other workspace', async () => {
    const { application, file } = await mount();
    file.dirty = true;

    application.files.add({ ...WORKSPACE, workspace: 'other' }, file);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(marked()).toBe(false);
  });
});
