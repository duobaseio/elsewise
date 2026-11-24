import type { AddPanelOptions, DockviewApi } from 'dockview-react';
import { expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { ProjectManager } from '@/projects/project-manager';
import { DefaultTab, FileTreeTab, WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { builtInApplication } from './commands';
import { showWorkspace, WORKSPACE, workspaceRouter } from './dock';
import { STUB_PANELS } from './dock-stubs';

import 'dockview-react/dist/styles/dockview.css';
import '@/routes/_shell/dockview.css';

const TABS = { fileTree: FileTreeTab, file: DefaultTab, terminal: DefaultTab };

/**
 * Mounts an active dock with a, b and c in one group, d and e in a group below, and f alone in a group beside them.
 */
export async function mount() {
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
  await frames();
  return dockview;
}

/**
 * The ids of each group's panels in order, as the dock has them.
 */
export const model = (dockview: DockviewApi) =>
  dockview.groups.map((group) => group.panels.map((panel) => panel.id).join()).sort();

/**
 * The panel ids of every tab element in each strip, placeholders and leftovers included.
 */
export const shown = () =>
  [...document.querySelectorAll('.dv-tabs-container')]
    .map((strip) =>
      [...strip.querySelectorAll<HTMLElement>('.dv-tab')].map((tab) => tab.dataset.tabPanelId ?? '?').join(),
    )
    .sort();

export const tab = (id: string) => document.querySelector(`.dv-tab[data-tab-panel-id="${id}"]`) as HTMLElement;

/**
 * The space after the tabs of the group that has the tab `id`.
 */
export const strip = (id: string) =>
  tab(id).closest('.dv-groupview')?.querySelector('.dv-void-container') as HTMLElement;

export const content = (id: string) =>
  tab(id).closest('.dv-groupview')?.querySelector('.dv-content-container') as HTMLElement;

export const group = (id: string) => tab(id).closest('.dv-groupview') as HTMLElement;

export const fills = () => document.querySelectorAll('[data-drop-target]').length;

/**
 * Waits for the drag to follow the pointer, which it does once a frame, and for the tabs that slide aside.
 */
export async function frames() {
  for (let frame = 0; frame < 6; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Where the pressed pointer is. `dispatch` sends it.
 */
export const pointer = { x: 0, y: 0 };

export function dispatch(type: string, target: EventTarget) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: pointer.x,
      clientY: pointer.y,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  );
}

/**
 * Moves the pressed pointer to the middle of `to`, or as far across it as `across` and down it as `down`.
 */
export async function move(to: Element, across = 0.5, down = 0.5) {
  const { x, y, width, height } = to.getBoundingClientRect();
  const from = { ...pointer };
  for (let step = 1; step <= 5; step++) {
    pointer.x = from.x + ((x + width * across - from.x) * step) / 5;
    pointer.y = from.y + ((y + height * down - from.y) * step) / 5;
    dispatch('pointermove', document);
    await frames();
  }
}

/**
 * Drags the tab `id` over `to` and holds it there.
 */
export async function hold(id: string, to: Element) {
  const { x, y, width, height } = tab(id).getBoundingClientRect();
  Object.assign(pointer, { x: x + width / 2, y: y + height / 2 });
  dispatch('pointerdown', tab(id));
  await frames();
  await move(to);
}

/**
 * Waits for the dropped or cancelled tab to settle, and expects the strips to show the dock's tabs.
 */
export async function settled(dockview: DockviewApi) {
  await expect.poll(() => document.querySelectorAll('[data-dnd-placeholder], [data-dnd-dragging]').length).toBe(0);
  await frames();
  expect(shown()).toEqual(model(dockview));
}

export async function drop(dockview: DockviewApi) {
  // A tab that slid aside is only found under the pointer once the pointer moves again.
  dispatch('pointermove', document);
  await frames();
  dispatch('pointerup', document.body);
  await settled(dockview);
}

export async function cancel(dockview: DockviewApi) {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settled(dockview);
}
