import type { DockviewApi } from 'dockview-react';
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import 'dockview-react/dist/styles/dockview.css';
import '@/routes/_shell/dockview.css';

import { ApplicationManagerContext } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import { ProjectManager } from '@/projects/project-manager';
import { FileTreeHeader } from '@/routes/_shell/$daemon/$project/$workspace/-file-tree/file-tree-header';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { builtInApplication } from '../../../commands';
import { addFile, showWorkspace, WORKSPACE, workspaceRouter } from '../../../dock';
import { stubComponents } from '../../../dock-stubs';

import { forcePseudoStates, THEMES } from '../../../sheet';

async function mount(
  theme: 'light' | 'dark',
  configure?: (application: ApplicationManager) => void,
): Promise<DockviewApi> {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({
    router,
    projects: new ProjectManager(client, router),
    panelComponents: stubComponents({
      fileTree: { header: FileTreeHeader },
    }),
  });
  configure?.(application);
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  let api: DockviewApi | undefined;
  render(
    <ApplicationManagerContext value={application}>
      <div
        className="dockview-theme-elsewise bg-background font-sans text-foreground"
        data-brightness={theme}
        data-testid="sheet"
        style={{ width: 1100, height: 700 }}
      >
        <WorkspaceDock
          onDockviewReady={(readyApi) => {
            addFile(readyApi);
            readyApi.addPanel({
              id: 'terminal:1',
              tabComponent: 'terminal',
              component: 'terminal',
              title: 'Terminal',
              params: { session: '1' },
              position: { referencePanel: 'file:$workspace.tsx', direction: 'below' },
              initialHeight: 200,
            });
            application.docks.attach(WORKSPACE, readyApi);
            api = readyApi;
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => {
    if (document.querySelectorAll('.dv-groupview').length !== 3) {
      throw new Error('dock not built');
    }
  });
  if (!api) {
    throw new Error('dock not ready');
  }
  return api;
}

test.each(THEMES)('workspace dock default layout (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-default-${theme}`);
});

test.each(THEMES)('workspace dock without tab (%s)', async (theme) => {
  const api = await mount(theme);

  api.getPanel('file:$workspace.tsx')?.api.close();
  api.getPanel('terminal:1')?.api.close();
  await expect.element(page.getByText('Placeholder for Agent chat')).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-placeholder-${theme}`);
});

async function addEditorGroupTerminals(api: DockviewApi) {
  const editorGroup = api.getPanel('file:$workspace.tsx')?.group;
  if (!editorGroup) {
    throw new Error('no editor group');
  }
  for (const index of [2, 3]) {
    api.addPanel({
      id: `term-${index}`,
      tabComponent: 'terminal',
      component: 'terminal',
      title: `zsh ${index}`,
      params: { index },
      position: { referenceGroup: editorGroup },
    });
  }
  api.getPanel('file:$workspace.tsx')?.api.setActive();
  await vi.waitFor(() => {
    if (editorGroup.element.querySelectorAll('.dv-tab').length !== 3) {
      throw new Error('terminal tabs not added');
    }
  });
}

const EDITOR_TAB = '.dv-active-group .dv-tabs-container > .dv-tab:nth-child(1)';
const HIDDEN_TAB = '.dv-active-group .dv-tabs-container > .dv-tab:nth-child(2)';

test.each(THEMES)('workspace dock tab hover states (%s)', async (theme) => {
  await addEditorGroupTerminals(await mount(theme));

  await forcePseudoStates([
    { selector: EDITOR_TAB, pseudoClasses: ['hover'] },
    {
      selector: `${EDITOR_TAB} button[aria-label^="Close"]`,
      pseudoClasses: ['hover'],
    },
    { selector: HIDDEN_TAB, pseudoClasses: ['hover'] },
    {
      selector: '.dv-inactive-group .dv-tab.dv-active-tab',
      pseudoClasses: ['hover'],
    },
    { selector: '.dv-tab:has([data-tabless])', pseudoClasses: ['hover'] },
  ]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-tab-hover-${theme}`);
});

test.each(THEMES)('workspace dock tab focus states (%s)', async (theme) => {
  await addEditorGroupTerminals(await mount(theme));

  await forcePseudoStates([
    { selector: EDITOR_TAB, pseudoClasses: ['focus-visible'] },
    {
      selector: `${HIDDEN_TAB} button[aria-label^="Close"]`,
      pseudoClasses: ['focus-visible'],
    },
  ]);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-tab-focus-${theme}`);
});

test.each(THEMES)('workspace dock tab overflow (%s)', async (theme) => {
  const api = await mount(theme);
  await addEditorGroupTerminals(api);
  api.getPanel('fileTree')?.group.api.setSize({ width: 800 });
  await expect.element(page.getByRole('button', { name: 'New tab' }).first()).toBeVisible();
  await expect.element(page.getByRole('button', { name: 'Show hidden tabs' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-tab-overflow-${theme}`);
});

test.each(THEMES)('workspace dock overflowing tabs menu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  const api = await mount(theme);
  await addEditorGroupTerminals(api);
  api.getPanel('fileTree')?.group.api.setSize({ width: 800 });

  await userEvent.click(page.getByRole('button', { name: 'Show hidden tabs' }));
  await expect.element(page.getByRole('menuitem').first()).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-overflowing-tabs-menu-${theme}`);
});

test.each(THEMES)('workspace dock panel menu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await mount(theme, ({ docks }) => {
    const source = { tab: true, closable: true, header: () => null, panel: () => null };
    docks.addPanelSources([
      { ...source, id: 'example/report', label: 'Report' },
      { ...source, id: 'example/chart', label: 'Chart' },
    ]);
    docks.addPanelMenu([
      { id: 'example.panels', order: 20, items: [{ order: 10, source: 'example/report' }] },
      { id: 'example.more', order: 30, items: [{ label: 'More', submenu: 'example.more' }] },
      { id: 'example.charts', in: 'example.more', items: [{ source: 'example/chart' }] },
    ]);
  });

  await userEvent.click(page.getByRole('button', { name: 'New tab' }).first());
  await expect.element(page.getByRole('menuitem', { name: 'Terminal' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-panel-menu-${theme}`);
});

test.each(THEMES)('workspace dock context menu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await addEditorGroupTerminals(await mount(theme));

  await userEvent.click(page.getByText('zsh 2'), { button: 'right' });
  await expect.element(page.getByRole('menuitem').first()).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-context-menu-${theme}`);
});

test.each(THEMES)('workspace dock context menu of file (%s)', async (theme) => {
  // The menu is portalled to the body, outside the sheet's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await addEditorGroupTerminals(await mount(theme));

  await userEvent.click(page.getByText('$workspace.tsx'), { button: 'right' });
  await expect.element(page.getByRole('menuitem').first()).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-context-menu-file-${theme}`);
});

test.each(THEMES)('workspace dock tree collapsed (%s)', async (theme) => {
  const api = await mount(theme);

  api.getPanel('fileTree')?.group.api.setVisible(false);
  await vi.waitFor(() => {
    const toggle = document.querySelector('button[aria-label="Toggle file tree"]');
    if (toggle?.getAttribute('aria-pressed') !== 'false') {
      throw new Error('tree not collapsed');
    }
  });

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`workspace-dock-collapsed-${theme}`);
});
