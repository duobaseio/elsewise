import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { ProjectManager } from '@/projects/project-manager';
import { TerminalManager } from '@/terminals/terminal-manager';
import { memoryRouter } from '../../test/commands';
import { addTerminal, EDITOR, FILE_TREE, mount as mountDock, TERMINAL, WORKSPACE } from '../../test/dock';
import { DockManager } from './dock-manager';

const OTHER = { ...EDITOR, id: 'editor:other.ts', relativePath: 'other.ts' };

// A dock that has the editor and another in a group, above the terminal and beside the file tree.
async function mount() {
  const dockview = await mountDock();
  dockview.addPanel({
    id: OTHER.id,
    component: 'editor',
    params: { path: OTHER.relativePath },
    position: { referencePanel: EDITOR.id },
  });
  addTerminal(dockview);
  dockview.getPanel(EDITOR.id)?.api.setActive();

  const terminals = new TerminalManager(new QueryClient());
  const deleted = vi.spyOn(terminals, 'delete').mockResolvedValue();
  const dock = new DockManager(
    WORKSPACE,
    dockview,
    new ProjectManager(new QueryClient(), memoryRouter()).workspaces,
    terminals,
    () => {},
    () => {},
    () => {},
  );
  return { dock, deleted };
}

describe('move', () => {
  test('moves panel and activates it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { tab: 'first', with: TERMINAL });

    expect(dock.groups).toEqual([
      { panels: [EDITOR], shown: EDITOR },
      { panels: [OTHER, TERMINAL], shown: OTHER },
      { panels: [FILE_TREE], shown: FILE_TREE },
    ]);
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('ignores panel that is not open', async () => {
    const { dock } = await mount();
    const groups = dock.groups;

    dock.move({ ...OTHER, id: 'closed' }, { edge: 'top' });

    expect(dock.groups).toEqual(groups);
  });
});

describe('close', () => {
  test('closes editor', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.close(OTHER)).resolves.toBe(true);

    expect(dock.get(OTHER.id)).toBeNull();
    expect(deleted).not.toHaveBeenCalled();
  });

  test('deletes terminal of panel', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.close(TERMINAL)).resolves.toBe(true);

    expect(deleted).toHaveBeenCalledExactlyOnceWith(TERMINAL.session);
    expect(dock.get(TERMINAL.id)).toBeNull();
  });

  test('rejects and keeps panel whose terminal is not deleted', async () => {
    const { dock, deleted } = await mount();
    deleted.mockRejectedValue(new Error('unreachable'));

    await expect(dock.close(TERMINAL)).rejects.toThrow('unreachable');

    expect(dock.get(TERMINAL.id)).toEqual(TERMINAL);
  });

  test('returns true for panel that is not open', async () => {
    const { dock } = await mount();

    await expect(dock.close({ ...OTHER, id: 'closed' })).resolves.toBe(true);
  });
});

describe('show', () => {
  test('shows panel without activating it', async () => {
    const { dock } = await mount();
    dock.activate(TERMINAL);

    dock.show(OTHER);

    expect(dock.groups[0]).toEqual({ panels: [EDITOR, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(TERMINAL);
  });

  test('shows hidden group of panel', async () => {
    const { dock } = await mount();
    dock.hide(FILE_TREE);

    dock.show(FILE_TREE);

    expect(dock.groups[2]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
    expect(dock.activePanel).toEqual(EDITOR);
  });
});

describe('hide', () => {
  test('hides group of panel', async () => {
    const { dock } = await mount();

    dock.hide(OTHER);

    expect(dock.groups[0]).toEqual({ panels: [EDITOR, OTHER], shown: null });
  });

  test('activates last active panel that is shown', async () => {
    const { dock } = await mount();
    dock.activate(TERMINAL);
    dock.activate(EDITOR);

    dock.hide(EDITOR);

    expect(dock.activePanel).toEqual(TERMINAL);
  });
});

describe('activate', () => {
  test('activates panel', async () => {
    const { dock } = await mount();

    dock.activate(OTHER);

    expect(dock.activePanel).toEqual(OTHER);
    expect(dock.groups[0]).toEqual({ panels: [EDITOR, OTHER], shown: OTHER });
  });

  test('shows hidden group of panel', async () => {
    const { dock } = await mount();
    dock.hide(FILE_TREE);

    dock.activate(FILE_TREE);

    expect(dock.activePanel).toEqual(FILE_TREE);
    expect(dock.groups[2]).toEqual({ panels: [FILE_TREE], shown: FILE_TREE });
  });

  test('ignores panel that is not open', async () => {
    const { dock } = await mount();

    dock.activate({ ...OTHER, id: 'closed' });

    expect(dock.activePanel).toEqual(EDITOR);
  });
});
