import type { Workspace } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { FILE_TREE_OPEN_FILE } from '@/fs/commands';
import { ProjectManager } from '@/projects/project-manager';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { builtInApplication } from '../../test/commands';
import { addFile, FILE, FILE_TREE, showWorkspace, TERMINAL, WORKSPACE, workspaceRouter } from '../../test/dock';

import 'dockview-react/dist/styles/dockview.css';

const SHOWN: Workspace = { id: WORKSPACE, name: 'w', state: 'ok', main: false, absolutePath: '/p/w' };

// An application that shows the workspace, whose dock has the file tree and what `build` adds.
async function mount(build: (dockview: DockviewApi) => void = addFile) {
  const { client, router } = workspaceRouter();
  const application = builtInApplication({ router, projects: new ProjectManager(client, router) });
  await showWorkspace(router);
  await vi.waitFor(() => expect(application.projects.workspaces.active).not.toBeNull());

  await render(
    <ApplicationManagerContext value={application}>
      <div style={{ width: 1100, height: 700 }}>
        <WorkspaceDock
          onDockviewReady={(ready) => {
            build(ready);
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());
  return { application, dock: application.docks.active as NonNullable<typeof application.docks.active> };
}

describe('FILE_TREE_OPEN_FILE', () => {
  test('opens file after last tab of active tab', async () => {
    const { application, dock } = await mount();

    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['src/a.ts'] });

    const opened = { ...FILE, id: dock.activePanel?.id, relativePath: 'src/a.ts' };
    expect(dock.groups[0]).toEqual({ panels: [FILE, opened], shown: opened });
  });

  test('activates open file', async () => {
    const { application, dock } = await mount();
    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['src/a.ts'] });

    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: [FILE.relativePath] });

    expect(dock.panels).toHaveLength(3);
    expect(dock.activePanel).toEqual(FILE);
  });

  test('opens each file', async () => {
    const { application, dock } = await mount();

    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['src/', 'src/a.ts', 'b.ts'] });

    expect(dock.groups[0]?.panels.map((panel) => panel.type === 'file' && panel.relativePath)).toEqual([
      FILE.relativePath,
      'src/a.ts',
      'b.ts',
    ]);
  });

  test('opens file beside active terminal', async () => {
    const { application, dock } = await mount((dockview) =>
      dockview.addPanel({
        id: TERMINAL.id,
        component: 'terminal',
        params: { session: TERMINAL.session.session },
        position: { referencePanel: FILE_TREE.id, direction: 'left' },
      }),
    );

    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['a.ts'] });

    expect(dock.groups[0]).toEqual({ panels: [TERMINAL, dock.activePanel], shown: dock.activePanel });
    expect(dock.activePanel?.type).toBe('file');
  });

  test('opens first file left of file tree', async () => {
    const { application, dock } = await mount(() => {});

    FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['a.ts'] });

    expect(dock.layout).toEqual({
      direction: 'row',
      children: [
        { panels: [dock.activePanel], shown: dock.activePanel },
        { panels: [FILE_TREE], shown: FILE_TREE },
      ],
    });
  });

  test('skips folders', async () => {
    const { application, dock } = await mount();

    expect(FILE_TREE_OPEN_FILE.run(application, { workspace: SHOWN, relativePaths: ['src/'] })).toBe(false);
    expect(dock.panels).toEqual([FILE, FILE_TREE]);
  });

  test('skips workspace not shown', async () => {
    const { application, dock } = await mount();
    const workspace = { ...SHOWN, id: { ...WORKSPACE, workspace: 'other' } };

    expect(FILE_TREE_OPEN_FILE.run(application, { workspace, relativePaths: ['a.ts'] })).toBe(false);
    expect(dock.panels).toEqual([FILE, FILE_TREE]);
  });
});
