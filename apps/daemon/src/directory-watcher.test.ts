import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import watcher from '@parcel/watcher';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DirectoryWatcher } from './directory-watcher';

vi.mock('@parcel/watcher', () => ({ default: { subscribe: vi.fn() } }));

const subscribe = vi.mocked(watcher.subscribe);

let root: string;
let callback: watcher.SubscribeCallback | undefined;
let unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>;
let directoryWatcher: DirectoryWatcher;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-watcher-')));
  callback = undefined;
  unsubscribe = vi.fn(async () => {});
  subscribe.mockImplementation(async (_dir, fn) => {
    callback = fn;
    return { unsubscribe };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  directoryWatcher = new DirectoryWatcher({ ignore: ['**/node_modules/**'] });
});

afterEach(async () => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

test('shares a single subscription between the watches of a root', async () => {
  const observer = vi.fn();
  directoryWatcher.observeRoots(observer);
  const first = directoryWatcher.watch(root, () => {});
  const second = directoryWatcher.watch(root, () => {});
  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'notify' }]));

  expect(subscribe).toHaveBeenCalledExactlyOnceWith(root, expect.any(Function), { ignore: ['**/node_modules/**'] });
  expect(observer).toHaveBeenCalledTimes(1);
  expect(directoryWatcher.roots()).toHaveLength(1);
  first.close();
  expect(directoryWatcher.roots()).toHaveLength(1);
  second.close();
  expect(directoryWatcher.roots()).toEqual([]);
  expect(observer).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
});

test('notifies every watch of the same root when changes occurs', async () => {
  const listener = vi.fn();
  directoryWatcher.watch(root, listener);
  directoryWatcher.watch(root, listener);
  await vi.waitFor(() => expect(callback).toBeDefined());

  callback?.(null, [
    { type: 'update', path: path.join(root, 'src', 'a.ts') },
    { type: 'create', path: path.join(path.dirname(root), 'outside.ts') },
  ]);

  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledWith(['src/a.ts']);
});

test.each([
  ['the watch limit', Object.assign(new Error('No space left on device'), { code: 'ENOSPC' }), 'watch-limit'],
  ['another error', new Error('boom'), 'other'],
])('degrades a root when subscribing fails with %s', async (_name, error, reason) => {
  subscribe.mockRejectedValue(error);

  directoryWatcher.watch(root, () => {});

  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'poll', reason }]));
});

test('polls a root that does not exist', async () => {
  const missing = path.join(root, 'missing');

  directoryWatcher.watch(missing, () => {});

  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root: missing, mode: 'poll', reason: 'other' }]));
  expect(subscribe).not.toHaveBeenCalled();
});

test('polls a root whose subscription reports an error', async () => {
  const observer = vi.fn();
  directoryWatcher.observeRoots(observer);
  const listener = vi.fn();
  directoryWatcher.watch(root, listener);
  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'notify' }]));

  callback?.(new Error('boom'), []);

  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'poll', reason: 'other' }]));
  expect(observer).toHaveBeenCalledTimes(2);
  expect(listener).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
});

test('ignores an error reported after a root was closed', async () => {
  const observer = vi.fn();
  directoryWatcher.observeRoots(observer);
  const watch = directoryWatcher.watch(root, () => {});
  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'notify' }]));
  watch.close();
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));

  callback?.(new Error('boom'), []);

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(console.error).not.toHaveBeenCalled();
  expect(observer).toHaveBeenCalledTimes(2);
});

test('drops a subscription that reported an error before it was established', async () => {
  subscribe.mockImplementation(async (_dir, fn) => {
    fn(new Error('boom'), []);
    return { unsubscribe };
  });

  directoryWatcher.watch(root, () => {});

  await vi.waitFor(() => expect(directoryWatcher.roots()).toEqual([{ root, mode: 'poll', reason: 'other' }]));
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
});

test('unsubscribes a root closed before its subscription was established', async () => {
  let establish: (() => void) | undefined;
  subscribe.mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      establish = resolve;
    });
    return { unsubscribe };
  });
  const observer = vi.fn();
  directoryWatcher.observeRoots(observer);
  const watch = directoryWatcher.watch(root, () => {});
  await vi.waitFor(() => expect(establish).toBeDefined());

  watch.close();
  establish?.();

  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  expect(directoryWatcher.roots()).toEqual([]);
  expect(observer).not.toHaveBeenCalled();
});
