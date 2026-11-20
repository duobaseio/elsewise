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
