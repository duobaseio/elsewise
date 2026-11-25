import type { DockviewApi, SerializedDockview } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { addFile } from '../../../../../../test/dock';
import { STUB_PANELS } from '../../../../../../test/dock-stubs';
import { WorkspaceDock } from './route';

import 'dockview-react/dist/styles/dockview.css';

async function mount(layout?: unknown) {
  let api: DockviewApi | undefined;
  let saved: SerializedDockview | undefined;
  const screen = await render(
    <div style={{ width: 1100, height: 700 }}>
      <WorkspaceDock
        panels={STUB_PANELS}
        layout={layout}
        onDockviewReady={(ready) => {
          api = ready;
        }}
        onLayoutChange={(changed) => {
          saved = changed;
        }}
      />
    </div>,
  );
  await vi.waitFor(() => {
    if (api === undefined) {
      throw new Error('dock not ready');
    }
  });
  return { api: api as DockviewApi, saved: () => saved, unmount: () => screen.unmount() };
}

test('restores layout after remount', async () => {
  const first = await mount();
  addFile(first.api);
  first.api.getPanel('fileTree')?.api.close();
  await vi.waitFor(() => expect(first.saved()).toBeDefined());
  const layout = first.saved();
  await first.unmount();

  const second = await mount(layout);

  expect(second.api.panels.map((panel) => panel.id)).toEqual(['file:$workspace.tsx']);
});

test('builds default layout from invalid layout', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { api } = await mount({ grid: 'invalid' });

  expect(api.panels.map((panel) => panel.id).sort()).toEqual(['fileTree', 'placeholder']);
});

test('restores placeholder beside file tree', async () => {
  const first = await mount();

  const { api } = await mount(first.api.toJSON());

  expect(api.groups.map((group) => [group.panels[0]?.id, group.api.width]).sort()).toEqual([
    ['fileTree', 350],
    ['placeholder', 714],
  ]);
});

test('shows no tab actions outside active dock', async () => {
  const { api } = await mount();
  addFile(api);
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(document.querySelector('button[aria-label="New tab"]')).toBeNull();
});
