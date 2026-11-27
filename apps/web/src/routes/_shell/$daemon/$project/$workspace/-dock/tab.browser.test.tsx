import type { CustomPanelSource } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { labels } from '../../../../../../../test/context-menu';
import { addFile, FILE, showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../../test/dock';
import { WorkspaceDock } from '../route';

import 'dockview-react/dist/styles/dockview.css';
import '@/routes/_shell/dockview.css';

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
      <div className="dockview-theme-elsewise" style={{ width: 1100, height: 700 }}>
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

  // Adds a second and a third file after the file, shows the file again, and returns the panels.
  function addFiles(dock: Awaited<ReturnType<typeof mount>>['dock']) {
    const second = dock.addFile('src/second.ts', { tab: 'last', with: FILE });
    const third = dock.addFile('src/third.ts', { tab: 'last', with: FILE });
    dock.activate(FILE);
    if (second === null || third === null) {
      throw new Error('files not added');
    }
    return { second, third };
  }

  test('opens context menu of panel commands', async () => {
    const { dock } = await mount();
    addFiles(dock);

    await userEvent.click(page.getByText('second.ts'), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    expect(labels()).toEqual([
      'Close',
      'Close others',
      'Close all',
      'Close to the left',
      'Close to the right',
      '-',
      'Split and move right',
      'Split and move down',
    ]);
  });

  test('omits close to the left for first tab', async () => {
    const { dock } = await mount();
    addFiles(dock);

    await userEvent.click(page.getByText('$workspace.tsx'), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    expect(labels()).not.toContain('Close to the left');
    expect(labels()).toContain('Close to the right');
  });

  test('closes clicked tab and keeps active panel', async () => {
    const { dock } = await mount();
    const { second, third } = addFiles(dock);

    await userEvent.click(page.getByText('second.ts'), { button: 'right' });
    expect(dock.activePanel).toEqual(FILE);
    await userEvent.click(page.getByRole('menuitem').first());

    await vi.waitFor(() => expect(dock.get(second.id)).toBeNull());
    expect(dock.groups[0]?.panels).toEqual([FILE, third]);
    expect(dock.activePanel).toEqual(FILE);
  });

  test('shows added group', async () => {
    const { application, dock } = await mount();
    addFiles(dock);
    application.commands.add([
      { id: 'example.pin', label: 'Pin', scope: 'panel', group: 'elsewise.panel', run: () => true },
    ]);
    application.docks.addContextMenu([{ id: 'example.panels', order: 30, items: [{ command: 'example.pin' }] }]);

    await userEvent.click(page.getByText('second.ts'), { button: 'right' });

    await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeVisible();
  });

  test('opens no context menu for file tree', async () => {
    await mount();

    await userEvent.click(page.getByText('Files'), { button: 'right' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(page.getByRole('menu').elements()).toHaveLength(0);
  });

  test('opens context menu anywhere on tab', async () => {
    const { dock } = await mount();
    addFiles(dock);
    await expect.element(page.getByText('second.ts')).toBeVisible();

    const header = page.getByText('second.ts').element();
    const trigger = header.closest('[data-slot="context-menu-trigger"]')?.getBoundingClientRect();
    const tab = header.closest('.dv-tab')?.getBoundingClientRect();

    expect(trigger).toEqual(tab);
  });
});
