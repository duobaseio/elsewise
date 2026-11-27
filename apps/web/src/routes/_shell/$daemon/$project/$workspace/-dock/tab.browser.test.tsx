import { DockTabHeader } from '@elsewise/components/components/dock';
import { Popover, PopoverContent } from '@elsewise/components/components/popover';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { CustomPanelSource } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext, useApplicationManager } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { NameInput } from '@/components/name-input';
import { ProjectManager } from '@/projects/project-manager';
import { useTerminalManager } from '@/terminals/terminal-manager';
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

const CLOSE_PANEL = PLATFORM === 'mac' ? '{Meta>}w{/Meta}' : '{Control>}{F4}{/Control}';

// A header with a close button, and a field in a popover while a terminal session is renamed, as a terminal's has.
function RenamedHeader() {
  const { terminals } = useApplicationManager();
  const renaming = useTerminalManager((manager) => manager.renaming !== null);
  const anchor = useRef<HTMLSpanElement>(null);
  const stop = () => {
    terminals.renaming = null;
  };
  return (
    <>
      <DockTabHeader title={<span ref={anchor}>Report header</span>} onClose={() => {}} />
      <Popover open={renaming}>
        <PopoverContent anchor={anchor} finalFocus={false} onContextMenu={(event) => event.stopPropagation()}>
          <NameInput label="Name" name="Report" onCancel={stop} onRename={stop} />
        </PopoverContent>
      </Popover>
    </>
  );
}

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
      'Split and move',
      '-',
      'Copy path',
    ]);
  });

  test('lists directions in split and move submenu', async () => {
    const { dock } = await mount();
    const { second } = addFiles(dock);

    await userEvent.click(page.getByText('second.ts'), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: 'Split and move' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Right' }));

    await vi.waitFor(() => expect(dock.groups.find((group) => group.panels.length === 1)?.panels).toEqual([second]));
  });

  test('omits split and move for lone tab', async () => {
    await mount();

    await userEvent.click(page.getByText('$workspace.tsx'), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    expect(labels()).not.toContain('Split and move');
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

  test('lists file commands for file', async () => {
    const { dock } = await mount();
    addFiles(dock);

    await userEvent.click(page.getByText('second.ts'), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    await userEvent.click(page.getByRole('menuitem', { name: 'Copy path' }));
    await expect.element(page.getByRole('menuitem', { name: 'Absolute' })).toBeVisible();
    await expect.element(page.getByRole('menuitem', { name: 'From workspace' })).toBeVisible();
    expect(labels()).not.toContain('Rename session…');
  });

  test('lists terminal commands for terminal', async () => {
    const { api } = await mount();
    api.addPanel({
      id: 'terminal:1',
      tabComponent: 'terminal',
      component: 'terminal',
      title: 'zsh',
      params: { session: '1' },
      position: { referencePanel: FILE.id },
    });

    await userEvent.click(page.getByText('zsh'), { button: 'right' });

    await expect.element(page.getByRole('menu')).toBeVisible();
    expect(labels()).toContain('Rename session…');
    expect(labels()).not.toContain('Copy path');
  });

  test('leaves focus to field that item shows in header, and off close button after it', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, header: RenamedHeader }]);
    application.commands.add([
      {
        id: 'example.rename',
        label: 'Rename report',
        scope: 'panel',
        group: 'elsewise.panel',
        run: ({ terminals }: ApplicationManager) => {
          terminals.renaming = { ...WORKSPACE, session: 'any' };
          return true;
        },
      },
    ]);
    application.docks.addContextMenu([{ id: 'example.panels', items: [{ command: 'example.rename' }] }]);
    dock.addPanel(REPORT.id, { tab: 'last', with: FILE });

    await userEvent.click(page.getByText('Report header'), { button: 'right' });
    await userEvent.click(page.getByRole('menuitem', { name: 'Rename report' }));
    await new Promise((resolve) => setTimeout(resolve, 300));

    await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(page.getByRole('textbox', { name: 'Name' }).elements()).toHaveLength(0));
    expect(document.activeElement).toBe(document.body);
  });

  test('asks panel of clicked tab to take focus', async () => {
    const { application, dock } = await mount();
    const { second } = addFiles(dock);

    await userEvent.click(page.getByText('second.ts'));

    expect(dock.activePanel).toEqual(second);
    expect(application.docks.focusRequest?.panel).toBe(second.id);
  });

  test('asks panel of clicked tab that is active to take focus', async () => {
    const { application, dock } = await mount();
    addFiles(dock);
    const before = application.docks.focusRequest?.monotonic ?? 0;

    await userEvent.click(page.getByText('$workspace.tsx'));

    expect(application.docks.focusRequest?.panel).toBe(FILE.id);
    expect(application.docks.focusRequest?.monotonic).toBeGreaterThan(before);
  });

  test('closes tabs in a row by key', async () => {
    const { api, dock } = await mount();
    addFiles(dock);
    for (const panel of api.panels) {
      panel.view.content.element.querySelector('div')?.append(document.createElement('button'));
    }
    const files = () => dock.panels.filter((panel) => panel.type === 'file');
    await userEvent.click(page.getByText('third.ts'));

    await userEvent.keyboard(CLOSE_PANEL);
    await vi.waitFor(() => expect(files()).toHaveLength(2));
    await userEvent.keyboard(CLOSE_PANEL);

    await vi.waitFor(() => expect(files()).toHaveLength(1));
  });
});
