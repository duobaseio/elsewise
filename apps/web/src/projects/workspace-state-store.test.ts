import { DEFAULT_WORKSPACE_STATE, type WorkspacesBridge } from '@elsewise/bridge';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WorkspaceStateStore } from './workspace-state-store';

const A = { daemon: 'local', project: 'p', workspace: 'a' };
const B = { daemon: 'local', project: 'p', workspace: 'b' };
const TREE = { expanded: ['src/'], selected: ['src/main.ts'] };

function bridge() {
  return {
    load: vi.fn<WorkspacesBridge['load']>(async () => DEFAULT_WORKSPACE_STATE),
    save: vi.fn<WorkspacesBridge['save']>(async () => {}),
    delete: vi.fn<WorkspacesBridge['delete']>(async () => {}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('load', () => {
  test('loads each workspace once', async () => {
    const fake = bridge();
    const store = new WorkspaceStateStore(fake);

    await Promise.all([store.load(A), store.load(A), store.load(B)]);

    expect(fake.load.mock.calls).toEqual([[A], [B]]);
  });

  test('defaults without bridge', async () => {
    await expect(new WorkspaceStateStore(undefined).load(A)).resolves.toEqual(DEFAULT_WORKSPACE_STATE);
  });

  test('defaults on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = bridge();
    fake.load.mockRejectedValue(new Error('unreadable'));

    await expect(new WorkspaceStateStore(fake).load(A)).resolves.toEqual(DEFAULT_WORKSPACE_STATE);
  });
});

describe('update', () => {
  test('merges partial state', async () => {
    const store = new WorkspaceStateStore(bridge());
    await store.load(A);

    store.update(A, { fileTree: TREE });
    store.update(A, { dock: { grid: {} } });

    expect(store.get(A)).toEqual({ dock: { grid: {} }, fileTree: TREE });
    expect(store.get(B)).toBeUndefined();
  });

  test('saves once after changes settle', () => {
    const fake = bridge();
    const store = new WorkspaceStateStore(fake);

    store.update(A, { dock: 1 });
    store.update(A, { dock: 2 });
    expect(fake.save).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(fake.save.mock.calls).toEqual([[A, { ...DEFAULT_WORKSPACE_STATE, dock: 2 }]]);
  });

  test('keeps state without bridge', () => {
    const store = new WorkspaceStateStore(undefined);

    store.update(A, { fileTree: TREE });

    expect(store.get(A)?.fileTree).toEqual(TREE);
  });
});

describe('flush', () => {
  test('saves pending state', async () => {
    const fake = bridge();
    const store = new WorkspaceStateStore(fake);
    store.update(A, { dock: 1 });
    store.update(B, { dock: 2 });

    await store.flush();
    vi.runAllTimers();

    expect(fake.save.mock.calls).toEqual([
      [A, { ...DEFAULT_WORKSPACE_STATE, dock: 1 }],
      [B, { ...DEFAULT_WORKSPACE_STATE, dock: 2 }],
    ]);
  });
});

describe('delete', () => {
  test('deletes workspace and ignores later updates', async () => {
    const fake = bridge();
    const store = new WorkspaceStateStore(fake);
    store.update(A, { dock: 1 });

    await store.delete(A);
    store.update(A, { dock: 2 });
    vi.runAllTimers();

    expect(fake.delete.mock.calls).toEqual([[A]]);
    expect(fake.save).not.toHaveBeenCalled();
    expect(store.get(A)).toBeUndefined();
  });

  test('deletes every workspace in project', async () => {
    const store = new WorkspaceStateStore(bridge());
    const other = { daemon: 'local', project: 'q', workspace: 'a' };
    store.update(A, { dock: 1 });
    store.update(B, { dock: 2 });
    store.update(other, { dock: 3 });

    await store.delete({ daemon: 'local', project: 'p' });

    expect([store.get(A), store.get(B), store.get(other)?.dock]).toEqual([undefined, undefined, 3]);
  });
});
