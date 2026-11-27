import type { CustomPanelProps, CustomPanelSource } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { useImperativeHandle } from 'react';
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

describe('CustomHeader', () => {
  test('renders header of source with its panel', async () => {
    const props: CustomPanelProps[] = [];
    const { application, dock } = await mount();
    application.docks.addPanelSources([
      {
        ...REPORT,
        header: (given) => {
          props.push(given);
          return <span>Report header</span>;
        },
      },
    ]);

    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await expect.element(page.getByText('Report header')).toBeVisible();
    expect(props.at(-1)).toEqual({ application, dock, panel });
  });

  test('hides header that throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { application, dock } = await mount();
    application.docks.addPanelSources([
      {
        ...REPORT,
        header: () => {
          throw new Error('broken');
        },
      },
    ]);

    dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await expect.element(page.getByText('Report body')).toBeVisible();
    expect(logged).toHaveBeenCalledWith('Header of panel source example/report failed', expect.any(Error));
  });
});

describe('customTooltip', () => {
  test('shows tooltip of source for its panel', async () => {
    const tooltip = vi.fn(() => <span>Report tooltip</span>);
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, tooltip }]);
    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await userEvent.hover(page.getByText('Report header'));

    await expect.element(page.getByText('Report tooltip')).toBeVisible();
    expect(tooltip).toHaveBeenLastCalledWith(application, dock, panel);
  });

  test('shows no tooltip of source that throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { application, dock } = await mount();
    application.docks.addPanelSources([
      {
        ...REPORT,
        tooltip: () => {
          throw new Error('broken');
        },
      },
    ]);
    dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await userEvent.hover(page.getByText('Report header'));

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(document.querySelectorAll('[data-slot="tooltip-content"]')).toHaveLength(0);
  });
});

describe('CustomPanelContent', () => {
  test('renders panel of source with its panel', async () => {
    const props: CustomPanelProps[] = [];
    const { application, dock } = await mount();
    application.docks.addPanelSources([
      {
        ...REPORT,
        panel: (given) => {
          props.push(given);
          return <p>Report body</p>;
        },
      },
    ]);

    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await expect.element(page.getByText('Report body')).toBeVisible();
    expect(props.at(-1)).toEqual({ application, dock, panel, ref: expect.any(Object) });
  });

  test('focuses through handle of panel that becomes active', async () => {
    const focused = vi.fn();
    const { application, dock } = await mount();
    application.docks.addPanelSources([
      {
        ...REPORT,
        panel: ({ ref }) => {
          useImperativeHandle(ref, () => ({ focus: focused }));
          return <p>Report body</p>;
        },
      },
    ]);

    dock.addPanel(REPORT.id, { tab: 'after', of: FILE });

    await vi.waitFor(() => expect(focused).toHaveBeenCalled());
  });

  test('focuses first focusable element of panel without handle', async () => {
    const { application, dock } = await mount();
    application.docks.addPanelSources([{ ...REPORT, panel: () => <input aria-label="Query" /> }]);

    const panel = dock.addPanel(REPORT.id, { tab: 'after', of: FILE }, false);
    await expect.element(page.getByRole('textbox', { name: 'Query' })).toBeVisible();
    if (panel !== null) {
      dock.activate(panel);
    }

    await expect.element(page.getByRole('textbox', { name: 'Query' })).toHaveFocus();
  });

  test('renders panel once its source is added', async () => {
    const { application, api } = await mount();
    api.addPanel({
      id: 'custom:1',
      tabComponent: 'custom',
      component: 'custom',
      params: { type: 'example/report', tab: true, closable: true },
      position: { referencePanel: FILE.id },
    });
    await vi.waitFor(() => expect(application.docks.active?.get('custom:1')).not.toBeNull());
    expect(page.getByText('Report body').elements()).toHaveLength(0);

    application.docks.addPanelSources([REPORT]);

    await expect.element(page.getByText('Report body')).toBeVisible();
  });
});
