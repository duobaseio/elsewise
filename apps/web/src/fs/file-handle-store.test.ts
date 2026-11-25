import { describe, expect, test, vi } from 'vitest';
import { fakeFileSystem } from '../../test/fake-file-system';
import { FileHandle } from './file-handle';
import { FileHandleStore } from './file-handle-store';

const WORKSPACE = { daemon: 'd', project: 'p', workspace: 'w' };

function handle(relativePath = 'main.ts') {
  return new FileHandle(fakeFileSystem().fileSystem, '/repo', relativePath);
}

describe('get', () => {
  test('returns added handle', () => {
    const store = new FileHandleStore();
    const added = handle();

    store.add(WORKSPACE, added);

    expect(store.get({ ...WORKSPACE }, 'main.ts')).toBe(added);
  });

  test('returns null for other workspace and path', () => {
    const store = new FileHandleStore();
    store.add(WORKSPACE, handle());

    expect(store.get({ ...WORKSPACE, workspace: 'other' }, 'main.ts')).toBeNull();
    expect(store.get(WORKSPACE, 'other.ts')).toBeNull();
  });
});

describe('add', () => {
  test('removes handle through returned function', () => {
    const store = new FileHandleStore();

    store.add(WORKSPACE, handle())();

    expect(store.get(WORKSPACE, 'main.ts')).toBeNull();
  });

  test('keeps handle that replaced removed one', () => {
    const store = new FileHandleStore();
    const remove = store.add(WORKSPACE, handle());
    const replacement = handle();
    store.add(WORKSPACE, replacement);

    remove();

    expect(store.get(WORKSPACE, 'main.ts')).toBe(replacement);
  });
});

describe('onChange', () => {
  test('notifies on add and removal', () => {
    const store = new FileHandleStore();
    const listener = vi.fn();
    store.onChange(listener);

    store.add(WORKSPACE, handle())();

    expect(listener).toHaveBeenCalledTimes(2);
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
