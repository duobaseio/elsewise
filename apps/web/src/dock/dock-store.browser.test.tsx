import { describe, expect, test } from 'vitest';
import { addTerminal, EDITOR, FILE_TREE, mount as mountDock, TERMINAL, WORKSPACE } from '../../test/dock';
import { DockStore } from './dock-store';

async function mount() {
  const api = await mountDock();
  return { api, store: new DockStore(WORKSPACE, api) };
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
