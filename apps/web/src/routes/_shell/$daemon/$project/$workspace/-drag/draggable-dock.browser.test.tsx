import type { AddPanelOptions, DockviewApi } from 'dockview-react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { builtInApplication } from '../../../../../../../test/commands';
import { showWorkspace, WORKSPACE, workspaceRouter } from '../../../../../../../test/dock';
import { STUB_PANELS } from '../../../../../../../test/dock-stubs';
import { DefaultTab, FileTreeTab, WorkspaceDock } from '../route';

import 'dockview-react/dist/styles/dockview.css';
import '../../../../dockview.css';

const TABS = { fileTree: FileTreeTab, file: DefaultTab, terminal: DefaultTab };

// Mounts an active dock with a, b and c in one group, d and e in a group below, and f alone in a group beside them.
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
          panels={STUB_PANELS}
          tabs={TABS}
          onDockviewReady={(ready) => {
            api = ready;
            application.docks.attach(WORKSPACE, ready);
          }}
        />
      </div>
    </ApplicationManagerContext>,
  );
  await vi.waitFor(() => expect(application.docks.active).not.toBeNull());

  const dockview = api as DockviewApi;
  const add = (id: string, position: AddPanelOptions['position']) =>
    dockview.addPanel({ id, component: 'file', tabComponent: 'file', title: id, position });
  add('a', { referencePanel: 'fileTree', direction: 'left' });
  add('b', { referencePanel: 'a', direction: 'within' });
  add('c', { referencePanel: 'a', direction: 'within' });
  add('d', { referencePanel: 'a', direction: 'below' });
  add('e', { referencePanel: 'd', direction: 'within' });
  add('f', { referencePanel: 'd', direction: 'right' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  return dockview;
}

const model = (dockview: DockviewApi) =>
  dockview.groups.map((group) => group.panels.map((panel) => panel.id).join()).sort();

// Every tab element in every strip, placeholders and leftovers included.
const shown = () =>
  [...document.querySelectorAll('.dv-tabs-container')]
    .map((strip) =>
      [...strip.querySelectorAll<HTMLElement>('.dv-tab')].map((tab) => tab.dataset.tabPanelId ?? '?').join(),
    )
    .sort();


function pointer(type: string, target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  );
}

const frames = () => new Promise((resolve) => setTimeout(resolve, 150));

// Drags the tab `from` over the tab `to` and holds it there.
async function hold(from: string, to: string) {
  const source = document.querySelector(`.dv-tab[data-tab-panel-id="${from}"]`) as HTMLElement;
  const target = document.querySelector(`.dv-tab[data-tab-panel-id="${to}"]`) as HTMLElement;
  const start = source.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  pointer('pointerdown', source, start.x + start.width / 2, start.y + start.height / 2);
  await frames();
  for (let step = 1; step <= 5; step++) {
    pointer(
      'pointermove',
      document,
      start.x + start.width / 2 + ((end.x + end.width / 2 - start.x - start.width / 2) * step) / 5,
      start.y + start.height / 2 + ((end.y + end.height / 2 - start.y - start.height / 2) * step) / 5,
    );
    await frames();
  }
}

async function settled(dockview: DockviewApi) {
  await expect.poll(() => document.querySelectorAll('[data-dnd-placeholder], [data-dnd-dragging]').length).toBe(0);
  await frames();
  expect(shown()).toEqual(model(dockview));
}

describe('spike', () => {
  test('reorders within group', async () => {
    const dockview = await mount();

    await hold('a', 'c');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);

    expect(model(dockview)).toContain('b,c,a');
  });

  test('moves into other group at position', async () => {
    const dockview = await mount();

    await hold('a', 'd');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);

    expect(model(dockview)).toContain('b,c');
    expect(model(dockview).some((group) => group.split(',').length === 3 && group.includes('a'))).toBe(true);
  });

  test('shows moved tab in other strip while held', async () => {
    const dockview = await mount();

    await hold('a', 'e');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
  });

  test('restores cancelled move from single tab group', async () => {
    const dockview = await mount();
    const before = model(dockview);

    await hold('f', 'd');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);

    expect(model(dockview)).toEqual(before);
  });

  test('moves sole tab into other group', async () => {
    const dockview = await mount();

    await hold('f', 'd');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
  });

  test('restores cancelled move of last tab', async () => {
    const dockview = await mount();
    const before = model(dockview);

    await hold('c', 'd');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);

    expect(model(dockview)).toEqual(before);
  });

  test('restores cancelled reorder', async () => {
    const dockview = await mount();
    const before = model(dockview);

    await hold('a', 'c');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);

    expect(model(dockview)).toEqual(before);
  });

  test('drags again after move and cancel', async () => {
    const dockview = await mount();

    await hold('a', 'd');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
    await hold('f', 'e');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
    await hold('b', 'c');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
    await hold('e', 'b');
    pointer('pointerup', document.body, 0, 0);
    await settled(dockview);
  });
});
