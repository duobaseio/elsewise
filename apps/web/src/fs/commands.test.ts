import type { Workspace } from '@elsewise/frontend-plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  FILE_TREE_CANCEL_CUT,
  FILE_TREE_COPY,
  FILE_TREE_COPY_PATH,
  FILE_TREE_COPY_RELATIVE_PATH,
  FILE_TREE_CUT,
  FILE_TREE_DELETE,
  FILE_TREE_NEW_FILE,
  FILE_TREE_NEW_FOLDER,
  FILE_TREE_OPEN_FILE_MANAGER,
  FILE_TREE_PASTE,
  FILE_TREE_RENAME,
} from '@/fs/commands';
import { builtInApplication } from '../../test/commands';

const WORKSPACE: Workspace = {
  id: { daemon: 'local', project: 'p', workspace: 'w' },
  name: 'w',
  state: 'ok',
  main: false,
  absolutePath: '/p/w',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return writeText;
}

describe('FILE_TREE_CUT', () => {
  test('cuts paths', () => {
    const application = builtInApplication();

    FILE_TREE_CUT.run(application, { workspace: WORKSPACE, paths: ['a', 'b/'] });

    expect(application.fileTree.clipboard).toEqual({ cut: true, workspace: WORKSPACE.id, paths: ['a', 'b/'] });
  });

  test('disables empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_CUT.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_CUT.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_COPY', () => {
  test('copies paths', () => {
    const application = builtInApplication();

    FILE_TREE_COPY.run(application, { workspace: WORKSPACE, paths: ['a', 'b/'] });

    expect(application.fileTree.clipboard).toEqual({ cut: false, workspace: WORKSPACE.id, paths: ['a', 'b/'] });
  });

  test('disables empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_COPY_PATH', () => {
  test('writes absolute paths on separate lines', () => {
    const writeText = clipboard();

    FILE_TREE_COPY_PATH.run(builtInApplication(), { workspace: WORKSPACE, paths: ['src/lib/', 'README.md'] });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('/p/w/src/lib\n/p/w/README.md');
  });

  test('joins with backslash on backslashed workspace', () => {
    const writeText = clipboard();
    const workspace = { ...WORKSPACE, absolutePath: 'C:\\p\\w\\' };

    FILE_TREE_COPY_PATH.run(builtInApplication(), { workspace, paths: ['src/main.ts'] });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('C:\\p\\w\\src\\main.ts');
  });

  test('disables empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY_PATH.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY_PATH.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_COPY_RELATIVE_PATH', () => {
  test('writes relative paths on separate lines', () => {
    const writeText = clipboard();

    FILE_TREE_COPY_RELATIVE_PATH.run(builtInApplication(), { workspace: WORKSPACE, paths: ['src/lib/', 'README.md'] });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('src/lib\nREADME.md');
  });

  test('keeps slashes on backslashed workspace', () => {
    const writeText = clipboard();
    const workspace = { ...WORKSPACE, absolutePath: 'C:\\p\\w' };

    FILE_TREE_COPY_RELATIVE_PATH.run(builtInApplication(), { workspace, paths: ['src/main.ts'] });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('src/main.ts');
  });

  test('disables empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY_RELATIVE_PATH.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_COPY_RELATIVE_PATH.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_CANCEL_CUT', () => {
  test('clears cut', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: true, workspace: WORKSPACE.id, paths: ['a.ts'] };

    FILE_TREE_CANCEL_CUT.run(application, { workspace: WORKSPACE, paths: ['a.ts'] });

    expect(application.fileTree.clipboard).toBeNull();
  });

  test('enables cut of same workspace', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: true, workspace: WORKSPACE.id, paths: ['a.ts'] };

    expect(FILE_TREE_CANCEL_CUT.enabled?.(application, { workspace: WORKSPACE, paths: ['b.ts'] })).toBe(true);
  });

  test('disables copy', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE.id, paths: ['a.ts'] };

    expect(FILE_TREE_CANCEL_CUT.enabled?.(application, { workspace: WORKSPACE, paths: ['a.ts'] })).toBe(false);
  });

  test('disables cut of other workspace', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: true, workspace: { ...WORKSPACE.id, workspace: 'x' }, paths: ['a.ts'] };

    expect(FILE_TREE_CANCEL_CUT.enabled?.(application, { workspace: WORKSPACE, paths: ['a.ts'] })).toBe(false);
  });

  test('disables empty clipboard', () => {
    const application = builtInApplication();

    expect(FILE_TREE_CANCEL_CUT.enabled?.(application, { workspace: WORKSPACE, paths: ['a.ts'] })).toBe(false);
  });
});

describe('FILE_TREE_PASTE', () => {
  test('opens dialog with folder of selection', () => {
    const application = builtInApplication();
    const open = vi.spyOn(application.fileTree.pasteDialog, 'openWithPayload');
    const clipboard = { cut: true, workspace: WORKSPACE.id, paths: ['a.ts'] };
    application.fileTree.clipboard = clipboard;

    FILE_TREE_PASTE.run(application, { workspace: WORKSPACE, paths: ['src/lib/'] });
    FILE_TREE_PASTE.run(application, { workspace: WORKSPACE, paths: ['src/main.ts'] });
    FILE_TREE_PASTE.run(application, { workspace: WORKSPACE, paths: ['README.md'] });
    FILE_TREE_PASTE.run(application, { workspace: WORKSPACE, paths: [] });

    expect(open.mock.calls).toEqual([
      [{ workspace: WORKSPACE, folder: 'src/lib/', clipboard }],
      [{ workspace: WORKSPACE, folder: 'src/', clipboard }],
      [{ workspace: WORKSPACE, folder: '', clipboard }],
      [{ workspace: WORKSPACE, folder: '', clipboard }],
    ]);
  });

  test('enables empty selection', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE.id, paths: ['a.ts'] };

    expect(FILE_TREE_PASTE.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(true);
  });

  test('enables clipboard of same workspace', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE.id, paths: ['a.ts'] };

    expect(FILE_TREE_PASTE.enabled?.(application, { workspace: WORKSPACE, paths: ['src/'] })).toBe(true);
  });

  test('disables empty clipboard', () => {
    const application = builtInApplication();

    expect(FILE_TREE_PASTE.enabled?.(application, { workspace: WORKSPACE, paths: ['src/'] })).toBe(false);
  });

  test('disables clipboard of other workspace', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: false, workspace: { ...WORKSPACE.id, workspace: 'x' }, paths: ['a.ts'] };

    expect(FILE_TREE_PASTE.enabled?.(application, { workspace: WORKSPACE, paths: ['src/'] })).toBe(false);
  });

  test('disables several paths', () => {
    const application = builtInApplication();
    application.fileTree.clipboard = { cut: false, workspace: WORKSPACE.id, paths: ['a.ts'] };

    expect(FILE_TREE_PASTE.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });
});

describe('FILE_TREE_NEW_FILE', () => {
  test('opens dialog with folder of selection', () => {
    const application = builtInApplication();
    const open = vi.spyOn(application.fileTree.newDialog, 'openWithPayload');

    FILE_TREE_NEW_FILE.run(application, { workspace: WORKSPACE, paths: ['src/lib/'] });
    FILE_TREE_NEW_FILE.run(application, { workspace: WORKSPACE, paths: ['src/main.ts'] });
    FILE_TREE_NEW_FILE.run(application, { workspace: WORKSPACE, paths: [] });

    expect(open.mock.calls).toEqual([
      [{ workspace: WORKSPACE, folder: 'src/lib/', kind: 'file' }],
      [{ workspace: WORKSPACE, folder: 'src/', kind: 'file' }],
      [{ workspace: WORKSPACE, folder: '', kind: 'file' }],
    ]);
  });

  test('disables several paths', () => {
    const application = builtInApplication();

    expect(FILE_TREE_NEW_FILE.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });
});

describe('FILE_TREE_NEW_FOLDER', () => {
  test('opens dialog with folder of selection', () => {
    const application = builtInApplication();
    const open = vi.spyOn(application.fileTree.newDialog, 'openWithPayload');

    FILE_TREE_NEW_FOLDER.run(application, { workspace: WORKSPACE, paths: ['src/main.ts'] });

    expect(open).toHaveBeenCalledExactlyOnceWith({ workspace: WORKSPACE, folder: 'src/', kind: 'folder' });
  });

  test('disables several paths', () => {
    const application = builtInApplication();

    expect(FILE_TREE_NEW_FOLDER.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });
});

describe('FILE_TREE_RENAME', () => {
  test('marks path renaming', () => {
    const application = builtInApplication();

    FILE_TREE_RENAME.run(application, { workspace: WORKSPACE, paths: ['src/'] });

    expect(application.fileTree.renaming).toEqual({ workspace: WORKSPACE.id, path: 'src/' });
  });

  test('disables several paths', () => {
    const application = builtInApplication();

    expect(FILE_TREE_RENAME.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_RENAME.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_DELETE', () => {
  test('opens dialog with selection', () => {
    const application = builtInApplication();
    const open = vi.spyOn(application.fileTree.deleteDialog, 'openWithPayload');
    const selection = { workspace: WORKSPACE, paths: ['a', 'b/'] };

    FILE_TREE_DELETE.run(application, selection);

    expect(open).toHaveBeenCalledExactlyOnceWith(selection);
  });

  test('disables empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_DELETE.enabled?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });

  test('hides empty selection', () => {
    const application = builtInApplication();

    expect(FILE_TREE_DELETE.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});

describe('FILE_TREE_OPEN_FILE_MANAGER', () => {
  test('shows path', () => {
    const application = builtInApplication();
    const showPath = vi.spyOn(application.platform, 'showPath').mockResolvedValue();

    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace: WORKSPACE, paths: ['src/lib/'] });
    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace: WORKSPACE, paths: ['src/main.ts'] });

    expect(showPath.mock.calls).toEqual([['/p/w/src/lib'], ['/p/w/src/main.ts']]);
  });

  test('joins with backslash on backslashed workspace', () => {
    const application = builtInApplication();
    const showPath = vi.spyOn(application.platform, 'showPath').mockResolvedValue();
    const workspace = { ...WORKSPACE, absolutePath: 'C:\\p\\w\\' };

    FILE_TREE_OPEN_FILE_MANAGER.run(application, { workspace, paths: ['src/main.ts'] });

    expect(showPath).toHaveBeenCalledExactlyOnceWith('C:\\p\\w\\src\\main.ts');
  });

  test('disables several paths', () => {
    const application = builtInApplication();

    expect(FILE_TREE_OPEN_FILE_MANAGER.enabled?.(application, { workspace: WORKSPACE, paths: ['a', 'b'] })).toBe(false);
  });

  test('hides empty selection', () => {
    vi.stubGlobal('window', { bridge: { window: { showPath: async () => {} } } });
    const application = builtInApplication();

    expect(FILE_TREE_OPEN_FILE_MANAGER.shown?.(application, { workspace: WORKSPACE, paths: ['a'] })).toBe(true);
    expect(FILE_TREE_OPEN_FILE_MANAGER.shown?.(application, { workspace: WORKSPACE, paths: [] })).toBe(false);
  });
});
