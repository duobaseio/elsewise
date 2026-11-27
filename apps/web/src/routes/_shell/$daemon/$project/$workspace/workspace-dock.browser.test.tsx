import type { DockviewApi, SerializedDockview } from 'dockview-react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { builtInApplication } from '../../../../../../test/commands';
import { addFile } from '../../../../../../test/dock';
import { stubComponents } from '../../../../../../test/dock-stubs';
import { FileTreeHeader } from './-file-tree/file-tree-header';
import { WorkspaceDock } from './route';

import 'dockview-react/dist/styles/dockview.css';

const COMPONENTS = stubComponents({ fileTree: { header: FileTreeHeader } });

async function mount(layout?: unknown, width = 1100) {
  let api: DockviewApi | undefined;
  let saved: SerializedDockview | undefined;
  const screen = await render(
    <ApplicationManagerContext value={builtInApplication({ panelComponents: COMPONENTS })}>
      <div style={{ width, height: 700 }}>
        <WorkspaceDock
          layout={layout}
          onDockviewReady={(ready) => {
            api = ready;
          }}
          onLayoutChange={(changed) => {
            saved = changed;
          }}
        />
      </div>
    </ApplicationManagerContext>,
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
    ['fileTree', 266],
    ['placeholder', 798],
  ]);
});

test('gives file tree quarter of dock', async () => {
  const { api } = await mount();

  expect(api.getPanel('fileTree')?.group.api.width).toBe(266);
});

test('limits file tree to 350 pixels', async () => {
  const { api } = await mount(undefined, 1800);

  expect(api.getPanel('fileTree')?.group.api.width).toBe(350);
});

test('shows no tab actions outside active dock', async () => {
  const { api } = await mount();
  addFile(api);
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(document.querySelector('button[aria-label="New tab"]')).toBeNull();
});
