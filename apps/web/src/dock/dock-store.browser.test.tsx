import type { WorkspaceId } from '@elsewise/frontend-plugin';
import type { DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { STUB_PANELS } from '../../test/dock-stubs';
import { DockStore } from './dock-store';

import 'dockview-react/dist/styles/dockview.css';

const WORKSPACE: WorkspaceId = { daemon: 'd', project: 'p', workspace: 'w' };

const EDITOR = {
  id: 'editor:$workspace.tsx',
  type: 'editor',
  tab: true,
  closable: true,
  relativePath: 'apps/web/src/routes/_shell/$daemon/$project/$workspace.tsx',
};
const FILE_TREE = { id: 'fileTree', type: 'fileTree', tab: false, closable: false };
const TERMINAL = {
  id: 'terminal:1',
  type: 'terminal',
  tab: true,
  closable: true,
  session: { ...WORKSPACE, session: '1' },
};

async function mount() {
  let api: DockviewApi | undefined;
  await render(
    <div style={{ width: 1100, height: 700 }}>
      <WorkspaceDock
        panels={STUB_PANELS}
        onDockviewReady={(ready) => {
          api = ready;
        }}
      />
    </div>,
  );
  await vi.waitFor(() => {
    if (api === undefined) {
      throw new Error('dock not ready');
    }
  });
  return { api: api as DockviewApi, store: new DockStore(WORKSPACE, api as DockviewApi) };
}

function addTerminal(api: DockviewApi) {
  return api.addPanel({
    id: 'terminal:1',
    component: 'terminal',
    params: { session: '1' },
    position: { referencePanel: EDITOR.id, direction: 'below' },
  });
}

describe('snapshot', () => {
  test('splits groups in row', async () => {
    const { store } = await mount();

    expect(store.snapshot.layout).toEqual({
      direction: 'row',
      children: [
        { panels: [EDITOR], shown: EDITOR },
        { panels: [FILE_TREE], shown: FILE_TREE },
      ],
    });
  });
});

describe('update', () => {
  test('nests column in row', async () => {
    const { api, store } = await mount();

    addTerminal(api);

    expect(store.update()).toBe(true);
    expect(store.snapshot.layout).toEqual({
      direction: 'row',
      children: [
        {
          direction: 'column',
          children: [
            { panels: [EDITOR], shown: EDITOR },
            { panels: [TERMINAL], shown: TERMINAL },
          ],
        },
        { panels: [FILE_TREE], shown: FILE_TREE },
      ],
    });
  });

  test('shows no panel in hidden group', async () => {
    const { api, store } = await mount();

    api.getPanel('fileTree')?.group.api.setVisible(false);
    store.update();

    expect(store.snapshot.groups).toEqual([
      { panels: [EDITOR], shown: EDITOR },
      { panels: [FILE_TREE], shown: null },
    ]);
  });

  test('follows activated panel', async () => {
    const { api, store } = await mount();

    api.getPanel('fileTree')?.api.setActive();
    store.update();

    expect(store.snapshot.activePanel).toEqual(FILE_TREE);
  });

  test('falls back to shown panel when active panel is hidden', async () => {
    const { api, store } = await mount();
    api.getPanel('fileTree')?.api.setActive();
    store.update();

    api.getPanel('fileTree')?.group.api.setVisible(false);
    store.update();

    expect(store.snapshot.activePanel).toEqual(EDITOR);
  });

  test('keeps active tab panel when tabless panel is activated', async () => {
    const { api, store } = await mount();

    api.getPanel('fileTree')?.api.setActive();
    store.update();

    expect(store.snapshot.activeTabPanel).toEqual(EDITOR);
  });

  test('falls back to open tab panel when active tab panel closes', async () => {
    const { api, store } = await mount();
    addTerminal(api).api.setActive();
    store.update();

    api.getPanel('terminal:1')?.api.close();
    store.update();

    expect(store.snapshot.activeTabPanel).toEqual(EDITOR);
  });

  test('returns false for resized group', async () => {
    const { api, store } = await mount();

    api.getPanel('fileTree')?.group.api.setSize({ width: 200 });

    expect(store.update()).toBe(false);
  });
});
