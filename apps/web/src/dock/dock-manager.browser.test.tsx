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
  const created = vi
    .spyOn(terminals.store, 'add')
    .mockResolvedValue({ id: { ...WORKSPACE, session: '2' }, name: 'Terminal', state: 'idle' } as never);
  const dock = new DockManager(
    WORKSPACE,
    dockview,
    new ProjectManager(new QueryClient(), memoryRouter()).workspaces,
    terminals,
    () => {},
    () => {},
    () => {},
  );
  return { dock, dockview, created, deleted };
}

const ADDED = { ...TERMINAL, id: 'terminal:2', session: { ...WORKSPACE, session: '2' } };

describe('addEditor', () => {
  test('adds and activates panel of file', async () => {
    const { dock } = await mount();

    const panel = dock.addEditor('src/new.ts', { tab: 'after', of: EDITOR });

    expect(panel).toEqual({ ...EDITOR, id: panel?.id, relativePath: 'src/new.ts' });
    expect(dock.groups[0]).toEqual({ panels: [EDITOR, panel, OTHER], shown: panel });
    expect(dock.activePanel).toEqual(panel);
  });

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    const panel = dock.addEditor('src/new.ts', { tab: 'first', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [panel, TERMINAL], shown: panel });
    expect(dock.activePanel).toEqual(EDITOR);
  });

  test('activates panel of open file', async () => {
    const { dock } = await mount();

    expect(dock.addEditor(OTHER.relativePath, { edge: 'top' })).toEqual(OTHER);

    expect(dock.panels).toHaveLength(4);
    expect(dock.activePanel).toEqual(OTHER);
  });

  test('returns null for panel that is not open', async () => {
    const { dock } = await mount();

    expect(dock.addEditor('src/new.ts', { tab: 'after', of: { ...OTHER, id: 'closed' } })).toBeNull();

    expect(dock.panels).toHaveLength(4);
  });
});

describe('addTerminal', () => {
  test('adds terminal and activates its panel', async () => {
    const { dock, created } = await mount();

    await expect(dock.addTerminal({ name: 'x' }, { tab: 'last', with: OTHER })).resolves.toEqual(ADDED);

    expect(created).toHaveBeenCalledExactlyOnceWith(WORKSPACE, { name: 'x' });
    expect(dock.groups[0]).toEqual({ panels: [EDITOR, OTHER, ADDED], shown: ADDED });
    expect(dock.activePanel).toEqual(ADDED);
  });

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    await dock.addTerminal({}, { group: 'right', of: TERMINAL }, false);

    expect(dock.groups[2]).toEqual({ panels: [ADDED], shown: ADDED });
    expect(dock.activePanel).toEqual(EDITOR);
  });

  test('returns null without terminal for panel that is not open', async () => {
    const { dock, created } = await mount();

    await expect(dock.addTerminal({}, { tab: 'last', with: { ...OTHER, id: 'closed' } })).resolves.toBeNull();

    expect(created).not.toHaveBeenCalled();
  });

  test('deletes terminal that cannot be placed', async () => {
    const { dock, deleted } = await mount();

    await expect(dock.addTerminal({}, { tab: 'last', with: FILE_TREE as never })).resolves.toBeNull();

    expect(deleted).toHaveBeenCalledExactlyOnceWith(ADDED.session);
    expect(dock.panels).toHaveLength(4);
  });

  test('deletes terminal created after dock is disposed', async () => {
    const { dock, dockview, created, deleted } = await mount();
    const { promise, resolve } = Promise.withResolvers<never>();
    created.mockReturnValue(promise);

    const added = dock.addTerminal({}, { edge: 'bottom' });
    dock.dispose();
    resolve({ id: ADDED.session, name: 'Terminal' } as never);

    await expect(added).resolves.toBeNull();
    expect(deleted).toHaveBeenCalledExactlyOnceWith(ADDED.session);
    expect(dockview.getPanel(ADDED.id)).toBeUndefined();
  });

  test('rejects when terminal is not created', async () => {
    const { dock, created } = await mount();
    created.mockRejectedValue(new Error('unreachable'));

    await expect(dock.addTerminal({}, { edge: 'bottom' })).rejects.toThrow('unreachable');

    expect(dock.panels).toHaveLength(4);
  });
});

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

  test('shows panel without activating it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { tab: 'last', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(EDITOR);
  });

  test('moves panel to edge without activating it', async () => {
    const { dock } = await mount();

    dock.move(OTHER, { edge: 'top' }, false);

    expect(dock.groups[0]).toEqual({ panels: [OTHER], shown: OTHER });
    expect(dock.activePanel).toEqual(EDITOR);
  });

  test('keeps moved panel active', async () => {
    const { dock } = await mount();

    dock.move(EDITOR, { tab: 'last', with: TERMINAL }, false);

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, EDITOR], shown: EDITOR });
    expect(dock.activePanel).toEqual(EDITOR);
  });

  test('shows hidden group that panel moves to', async () => {
    const { dock } = await mount();
    dock.hide(TERMINAL);

    dock.move(OTHER, { tab: 'last', with: TERMINAL });

    expect(dock.groups[1]).toEqual({ panels: [TERMINAL, OTHER], shown: OTHER });
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
