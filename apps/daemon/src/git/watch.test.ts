import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TestRepo } from '../../test/git/repo';
import type { ChangeListener, DirectoryWatcher } from '../directory-watcher';
import type { StatusInit } from './commands/status';
import { Git } from './git';
import { watchStatus } from './watch';

const DEBOUNCE_MS = 10;

let repo: TestRepo;
let streams: Stream[];

beforeEach(async () => {
  repo = await TestRepo.create();
  streams = [];
});

afterEach(async () => {
  for (const stream of streams) {
    stream.abort.abort();
    await stream.ended;
  }
  await repo.remove();
});

interface Stream {
  abort: AbortController;
  read: ReturnType<typeof vi.fn<() => Promise<StatusInit>>>;
  close: ReturnType<typeof vi.fn>;
  roots: string[];
  notify: ChangeListener;
  seen: StatusInit[];
  ended: Promise<void>;
  set(next: StatusInit): void; // Sets what the next reads return.
}

function status(branch: string): StatusInit {
  return { branch, hash: '', upstream: '', upstreamGone: false, ahead: 0, behind: 0, entries: [] };
}

function start(git: Git, { pollIntervalMs = 60_000 } = {}): Stream {
  let current = status('main');
  const stream: Stream = {
    abort: new AbortController(),
    read: vi.fn(async () => current),
    close: vi.fn(),
    roots: [],
    notify: () => {}, // Replaced once subscribed.
    seen: [],
    ended: Promise.resolve(), // Replaced below.
    set: (next) => {
      current = next;
    },
  };
  streams.push(stream);

  const watcher = {
    watch: (root: string, listener: ChangeListener) => {
      stream.roots.push(root);
      stream.notify = listener;
      return { ready: Promise.resolve(), close: stream.close };
    },
  } as unknown as DirectoryWatcher;
  const statuses = watchStatus(git, stream.abort.signal, {
    watcher,
    pollIntervalMs,
    debounceMs: DEBOUNCE_MS,
    read: () => stream.read(),
  });
  stream.ended = (async () => {
    for await (const next of statuses) {
      stream.seen.push(next);
    }
  })();
  stream.ended.catch(() => {});
  return stream;
}

function settleDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 5));
}

test('yields the current status and when it changes', async () => {
  const stream = start(repo.git);
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));

  stream.notify(['a.txt']);
  await settleDebounce();
  expect(stream.read).toHaveBeenCalledTimes(2);
  expect(stream.seen).toHaveLength(1);

  stream.set(status('feature'));
  stream.notify(['a.txt']);
  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  expect(stream.seen.map((next) => next.branch)).toEqual(['main', 'feature']);
});

test('debounce the notified changes', async () => {
  const stream = start(repo.git);
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));

  stream.notify(['a.txt']);
  stream.notify(['b.txt']);
  stream.notify(['c.txt']);
  await settleDebounce();

  expect(stream.read).toHaveBeenCalledTimes(2);
});

test('polls for changes', async () => {
  const stream = start(repo.git, { pollIntervalMs: 20 });

  await vi.waitFor(() => expect(stream.read.mock.calls.length).toBeGreaterThanOrEqual(3));
  expect(stream.seen).toHaveLength(1);
});

test('reads again when notified during read in progress', async () => {
  const stream = start(repo.git);
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));
  let finish: (() => void) | undefined;
  stream.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(status('main')); // Blocks the first read.
      }),
  );

  stream.notify(['a.txt']);
  await vi.waitFor(() => expect(finish).toBeDefined());
  stream.set(status('feature'));
  stream.notify(['b.txt']);
  await settleDebounce();
  finish?.(); // Unblock the first read.

  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  expect(stream.read).toHaveBeenCalledTimes(3);
});

test('ends when aborted stream even while read is in progress', async () => {
  const stream = start(repo.git);
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));
  let finish: (() => void) | undefined;
  stream.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(status('feature')); // Blocks the first read.
      }),
  );

  stream.notify(['a.txt']);
  await vi.waitFor(() => expect(finish).toBeDefined());
  stream.abort.abort();
  finish?.(); // Unblock the first read.
  await stream.ended;

  expect(stream.seen).toHaveLength(1);
  expect(stream.close).toHaveBeenCalledTimes(1);
  stream.notify(['b.txt']);
  await settleDebounce();
  expect(stream.read).toHaveBeenCalledTimes(2);
});

test('watches the worktree and the main git directory', async () => {
  await repo.commit('a.txt', 'A');
  const worktreeNativeAbsolutePath = path.join(path.dirname(repo.nativeRoot), 'linked');
  await repo.run('worktree', 'add', '--quiet', worktreeNativeAbsolutePath, '-b', 'linked');

  const main = start(repo.git);
  await vi.waitFor(() => expect(main.seen).toHaveLength(1));
  expect(main.roots).toEqual([repo.nativeRoot]);

  const worktree = start(new Git(worktreeNativeAbsolutePath, Number.POSITIVE_INFINITY));
  await vi.waitFor(() => expect(worktree.seen).toHaveLength(1));
  expect(worktree.roots).toEqual([
    worktreeNativeAbsolutePath,
    path.join(repo.nativeRoot, '.git', 'worktrees', 'linked'),
  ]);
});
