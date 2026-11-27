import type { CustomPanelSource } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { addFile, showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../../test/dock';
import { WorkspaceDock } from '../route';

import 'dockview-react/dist/styles/dockview.css';

const REPORT: CustomPanelSource = {
  id: 'example/report',
  label: 'Report',
  tab: true,
  closable: true,
  header: () => <span>Report header</span>,
  panel: () => <p>Report body</p>,
};

// An application whose dock shows the workspace, with the file beside the file tree.
async function mount() {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  let api: DockviewApi | undefined;
  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          onDockviewReady={(ready) => {
            addFile(ready);
            application.docks.attach(WORKSPACE, ready);
            api = ready;
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());
  return {
    application,
    api: api as DockviewApi,
    dock: application.docks.active as NonNullable<typeof application.docks.active>,
  };
}

const marked = () => document.querySelectorAll('.dv-groupview:has([data-tabless])').length;

describe('Tab', () => {
  test('marks group of file tree alone', async () => {
    await mount();

    expect(document.querySelectorAll('.dv-groupview')).toHaveLength(2);
    expect(marked()).toBe(1);
  });

  test('marks group of tabless custom panel', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, tab: false }]);

    dock.addPanel(REPORT.id, { edge: 'bottom' });

    await expect.poll(marked).toBe(2);
  });

  test('leaves group of tab custom panel unmarked', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([REPORT]);

    dock.addPanel(REPORT.id, { edge: 'bottom' });

    await expect.element(page.getByText('Report header')).toBeVisible();
    expect(marked()).toBe(1);
  });

  test('shows header of panel component', async () => {
    await mount();

    await expect.element(page.getByText('$workspace.tsx')).toBeVisible();
  });
});
