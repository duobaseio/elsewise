import type { DockviewApi, SerializedDockview } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
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
  first.api.getPanel('term-1')?.api.close();
  await vi.waitFor(() => expect(first.saved()).toBeDefined());
  const layout = first.saved();
  first.unmount();

  const second = await mount(layout);

  expect(second.api.panels.map((panel) => panel.id).sort()).toEqual(['editor:$workspace.tsx', 'fileTree']);
});

test('builds default layout from invalid layout', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { api } = await mount({ grid: 'invalid' });

  expect(api.panels.map((panel) => panel.id).sort()).toEqual(['editor:$workspace.tsx', 'fileTree', 'term-1']);
});
