import type { CustomPanelSource } from '@elsewise/frontend-plugin';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { addFile, FILE, showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../../test/dock';
import { WorkspaceDock } from '../route';

import 'dockview-react/dist/styles/dockview.css';

const REPORT: CustomPanelSource = {
  id: 'example/report',
  label: 'Report',
  tab: true,
  closable: true,
  header: () => <span>Report header</span>,
  panel: () => null,
};

// An application whose dock shows the workspace, with the file beside the file tree. Adding a terminal is recorded,
// and adds none.
async function mount() {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          onDockviewReady={(ready) => {
            addFile(ready);
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());
  const dock = application.docks.active as NonNullable<typeof application.docks.active>;
  const addedTerminal = vi.spyOn(dock, 'addTerminal').mockResolvedValue(null);
  return { docks: application.docks, dock, addedTerminal };
}

describe('AddTabAction', () => {
  test('adds terminal at once while menu has one item', async () => {
    const { addedTerminal } = await mount();

    await page.getByRole('button', { name: 'New tab' }).click();

    expect(addedTerminal).toHaveBeenCalledExactlyOnceWith({ closeConfirmation: false }, { tab: 'last', with: FILE });
    expect(page.getByRole('menu').elements()).toHaveLength(0);
  });

  test('opens menu once it has several items', async () => {
    const { docks, addedTerminal } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([{ id: 'example.panels', order: 20, items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Terminal' })).toBeVisible();
    await expect.element(page.getByRole('menuitem', { name: 'Report' })).toBeVisible();
    expect(addedTerminal).not.toHaveBeenCalled();
  });

  test('adds panel of chosen source last in group', async () => {
    const { docks, dock } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([{ id: 'example.panels', order: 20, items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();
    await page.getByRole('menuitem', { name: 'Report' }).click();

    await vi.waitFor(() => expect(dock.groups[0]?.panels.map((panel) => panel.type)).toEqual(['file', REPORT.id]));
  });

  test('adds chosen terminal', async () => {
    const { docks, addedTerminal } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([{ id: 'example.panels', order: 20, items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();
    await page.getByRole('menuitem', { name: 'Terminal' }).click();

    expect(addedTerminal).toHaveBeenCalledExactlyOnceWith({ closeConfirmation: false }, { tab: 'last', with: FILE });
  });

  test('labels item as given over source', async () => {
    const { docks } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([{ id: 'example.panels', items: [{ label: 'Weekly report', source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Weekly report' })).toBeVisible();
  });

  test('hides item whose source is not added', async () => {
    const { docks, addedTerminal } = await mount();
    docks.addPanelMenu([{ id: 'example.panels', items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();

    expect(addedTerminal).toHaveBeenCalledOnce();
  });

  test('hides item of tabless source', async () => {
    const { docks, addedTerminal } = await mount();
    docks.addPanelSources([{ ...REPORT, tab: false }]);
    docks.addPanelMenu([{ id: 'example.panels', items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();

    expect(addedTerminal).toHaveBeenCalledOnce();
  });

  test('opens submenu of groups in it', async () => {
    const { docks } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([
      { id: 'example.more', items: [{ label: 'More', submenu: 'example.more' }] },
      { id: 'example.reports', in: 'example.more', items: [{ source: REPORT.id }] },
    ]);

    await page.getByRole('button', { name: 'New tab' }).click();
    await page.getByRole('menuitem', { name: 'More' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Report' })).toBeVisible();
  });
});
