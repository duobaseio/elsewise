import type { CustomPanelSource } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
  const dock = application.docks.active as NonNullable<typeof application.docks.active>;
  const addedTerminal = vi.spyOn(dock, 'addTerminal').mockResolvedValue(null);
  return { api: api as DockviewApi, docks: application.docks, dock, addedTerminal };
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

  test('separates groups', async () => {
    const { docks } = await mount();
    docks.addPanelSources([REPORT]);
    docks.addPanelMenu([{ id: 'example.panels', order: 20, items: [{ source: REPORT.id }] }]);

    await page.getByRole('button', { name: 'New tab' }).click();

    await expect.element(page.getByRole('menuitem', { name: 'Report' })).toBeVisible();
    expect(page.getByRole('separator').elements()).toHaveLength(1);
  });

  test('hides submenu without shown item', async () => {
    const { docks, addedTerminal } = await mount();
    docks.addPanelMenu([
      { id: 'example.more', items: [{ label: 'More', submenu: 'example.more' }] },
      { id: 'example.reports', in: 'example.more', items: [{ source: REPORT.id }] },
    ]);

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

describe('OverflowTabsAction', () => {
  // Adds files until tabs overflow, shows the first tab again, and opens the menu of the overflowing ones.
  async function openOverflowing(dock: Awaited<ReturnType<typeof mount>>['dock']) {
    for (let index = 0; index < 12; index++) {
      dock.addFile(`src/overflowing-tab-${index}.ts`, { tab: 'first', with: FILE });
    }
    dock.activate(dock.groups[0]?.panels[0] ?? FILE);
    const button = page.getByRole('button', { name: 'Show hidden tabs' });
    await vi.waitFor(() => expect(getComputedStyle(button.element()).visibility).toBe('visible'));
    await userEvent.click(button);
    await expect.element(page.getByRole('menuitem').first()).toBeVisible();
  }

  test('shows header of custom panel', async () => {
    const { docks, dock } = await mount();
    docks.addPanelSources([REPORT]);
    dock.addPanel(REPORT.id, { tab: 'last', with: FILE });

    await openOverflowing(dock);

    await expect.element(page.getByRole('menuitem', { name: 'Report header' })).toBeVisible();
  });

  test('omits custom panel without source', async () => {
    const { api, dock } = await mount();
    api.addPanel({
      id: 'custom:1',
      tabComponent: 'custom',
      component: 'custom',
      params: { type: REPORT.id, tab: true, closable: true },
      position: { referencePanel: FILE.id },
    });

    await openOverflowing(dock);

    const rows = page.getByRole('menuitem').elements();
    expect(rows.at(-1)?.textContent).toBe('$workspace.tsx');
  });
});
