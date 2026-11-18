import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../test/commands';
import { EDITOR, FILE_TREE, showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../test/dock';
import { STUB_PANELS } from '../../../../../../test/dock-stubs';
import { WorkspaceDock } from './route';

import 'dockview-react/dist/styles/dockview.css';

// A dock attached to an application that shows its workspace.
async function mount() {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          panels={STUB_PANELS}
          onDockviewReady={(ready) => {
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());
  return application.docks.active as NonNullable<typeof application.docks.active>;
}

test('hides and shows file tree from tool stripe', async () => {
  const dock = await mount();
  const toggle = page.getByRole('button', { name: 'Toggle file tree' });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();

  expect(dock.groups[1]).toEqual({ panels: [FILE_TREE], shown: null });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();

  expect(dock.groups[1]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('shows file tree hidden through dock in tool stripe', async () => {
  const dock = await mount();

  dock.hide(FILE_TREE);

  await expect.element(page.getByRole('button', { name: 'Toggle file tree' })).toHaveAttribute('aria-pressed', 'false');
});

test('closes editor through dock', async () => {
  const dock = await mount();
  const closed = vi.spyOn(dock, 'close');
  const added = dock.addEditor('src/other.ts', { tab: 'after', of: EDITOR });

  await page.getByRole('button', { name: 'Close other.ts' }).click();

  expect(closed).toHaveBeenCalledExactlyOnceWith(added);
  await vi.waitFor(() => expect(dock.panels).toEqual([EDITOR, FILE_TREE]));
});
