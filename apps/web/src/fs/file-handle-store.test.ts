import { describe, expect, test, vi } from 'vitest';
import { fakeFileSystem } from '../../test/fake-file-system';
import { FileHandle } from './file-handle';
import { FileHandleStore } from './file-handle-store';

const WORKSPACE = { daemon: 'd', project: 'p', workspace: 'w' };

function handle(relativePath = 'main.ts') {
  return new FileHandle(fakeFileSystem().fileSystem, '/repo', relativePath);
}

describe('get', () => {
  test('returns null for other workspace and path', () => {
    const store = new FileHandleStore();
    store.open(WORKSPACE, fakeFileSystem().fileSystem, '/repo', 'main.ts');

    expect(store.get({ ...WORKSPACE, workspace: 'other' }, 'main.ts')).toBeNull();
    expect(store.get(WORKSPACE, 'other.ts')).toBeNull();
  });
});

describe('open', () => {
  test('returns handle of file', () => {
    const store = new FileHandleStore();

    const opened = store.open(WORKSPACE, fakeFileSystem().fileSystem, '/repo', 'main.ts');

    expect(opened.relativePath).toBe('main.ts');
    expect(store.get({ ...WORKSPACE }, 'main.ts')).toBe(opened);
  });

  test('returns handle of open file', () => {
    const store = new FileHandleStore();
    const { fileSystem } = fakeFileSystem();
    const opened = store.open(WORKSPACE, fileSystem, '/repo', 'main.ts');

    expect(store.open({ ...WORKSPACE }, fileSystem, '/repo', 'main.ts')).toBe(opened);
  });
});

describe('close', () => {
  test('disposes handle', () => {
    const store = new FileHandleStore();
    const fake = fakeFileSystem();

    store.close(WORKSPACE, store.open(WORKSPACE, fake.fileSystem, '/repo', 'main.ts'));

    expect(fake.cancelled()).toBe(true);
    expect(store.get(WORKSPACE, 'main.ts')).toBeNull();
  });

  test('keeps handle that is still open', () => {
    const store = new FileHandleStore();
    const fake = fakeFileSystem();
    const opened = store.open(WORKSPACE, fake.fileSystem, '/repo', 'main.ts');
    store.open(WORKSPACE, fake.fileSystem, '/repo', 'main.ts');

    store.close(WORKSPACE, opened);

    expect(fake.cancelled()).toBe(false);
    expect(store.get(WORKSPACE, 'main.ts')).toBe(opened);
  });

  test('keeps handle that replaced closed one', () => {
    const store = new FileHandleStore();
    const { fileSystem } = fakeFileSystem();
    const replaced = store.open(WORKSPACE, fileSystem, '/repo', 'main.ts');
    const moved = store.open(WORKSPACE, fileSystem, '/repo', 'other.ts');
    store.move(WORKSPACE, 'other.ts', 'main.ts');

    store.close(WORKSPACE, replaced);

    expect(store.get(WORKSPACE, 'main.ts')).toBe(moved);
  });
});

describe('move', () => {
  test('points handle at moved file', () => {
    const store = new FileHandleStore();
    const opened = store.open(WORKSPACE, fakeFileSystem().fileSystem, '/repo', 'main.ts');

    store.move(WORKSPACE, 'main.ts', 'src/index.ts');

    expect(opened.relativePath).toBe('src/index.ts');
    expect(store.get(WORKSPACE, 'src/index.ts')).toBe(opened);
    expect(store.get(WORKSPACE, 'main.ts')).toBeNull();
  });

  test('points handles under moved folder', () => {
    const store = new FileHandleStore();
    const { fileSystem } = fakeFileSystem();
    const nested = store.open(WORKSPACE, fileSystem, '/repo', 'src/fs/main.ts');
    const sibling = store.open(WORKSPACE, fileSystem, '/repo', 'src-old/main.ts');

    store.move(WORKSPACE, 'src/', 'lib/');

    expect(nested.relativePath).toBe('lib/fs/main.ts');
    expect(sibling.relativePath).toBe('src-old/main.ts');
  });

  test('keeps handles of other workspace', () => {
    const store = new FileHandleStore();
    const other = store.open({ ...WORKSPACE, workspace: 'other' }, fakeFileSystem().fileSystem, '/repo', 'main.ts');

    store.move(WORKSPACE, 'main.ts', 'index.ts');

    expect(other.relativePath).toBe('main.ts');
  });
});

describe('onChange', () => {
  test('notifies on open, move and close', () => {
    const store = new FileHandleStore();
    const listener = vi.fn();
    store.onChange(listener);

    const opened = store.open(WORKSPACE, fakeFileSystem().fileSystem, '/repo', 'main.ts');
    store.move(WORKSPACE, 'main.ts', 'index.ts');
    store.close(WORKSPACE, opened);

    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('openCloseDialog', () => {
  // A store whose dialog is not rendered.
  function store() {
    const files = new FileHandleStore();
    const opened = vi.spyOn(files.closeDialog, 'openWithPayload').mockImplementation(() => {});
    const closed = vi.spyOn(files.closeDialog, 'close').mockImplementation(() => {});
    return { files, opened, closed };
  }

  test('opens dialog for file and failure', () => {
    const { files, opened } = store();
    const file = handle();

    void files.openCloseDialog(file, 'unreachable');

    expect(opened).toHaveBeenCalledExactlyOnceWith({ file, failure: 'unreachable' });
  });

  test('returns action dialog is closed with', async () => {
    const { files, closed } = store();
    const action = files.openCloseDialog(handle(), null);

    files.closeCloseDialog('overwrite');

    await expect(action).resolves.toBe('overwrite');
    expect(closed).toHaveBeenCalledOnce();
  });

  test('cancels dialog that another replaces', async () => {
    const { files } = store();
    const earlier = files.openCloseDialog(handle(), null);

    const later = files.openCloseDialog(handle('other.ts'), null);
    files.closeCloseDialog('discard');

    await expect(earlier).resolves.toBe('cancel');
    await expect(later).resolves.toBe('discard');
  });
});

describe('closeCloseDialog', () => {
  test('does nothing while no dialog is open', () => {
    const files = new FileHandleStore();
    const closed = vi.spyOn(files.closeDialog, 'close').mockImplementation(() => {});

    files.closeCloseDialog('cancel');

    expect(closed).not.toHaveBeenCalled();
  });
});
