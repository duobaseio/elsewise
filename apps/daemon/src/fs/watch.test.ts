import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ChangeListener, DirectoryWatcher } from '../directory-watcher';
import { type Snapshot, type WatchRequest, watchPaths } from './watch';

const DEBOUNCE_MS = 10;

let root: string;
let streams: Stream[];

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-watch-')));
  streams = [];
});

afterEach(async () => {
  for (const stream of streams) {
    stream.abort.abort();
  }
  await fs.rm(root, { recursive: true, force: true });
});

class Requests implements AsyncIterable<WatchRequest> {
  readonly #items: WatchRequest[] = [];
  #done = false;
  #wake: (() => void) | undefined;

  push(request: WatchRequest): void {
    this.#items.push(request);
    this.#wake?.();
  }

  end(): void {
    this.#done = true;
    this.#wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<WatchRequest> {
    while (true) {
      const next = this.#items.shift();
      if (next) {
        yield next;
      } else if (this.#done) {
        return;
      } else {
        await new Promise<void>((resolve) => {
          this.#wake = resolve;
        });
      }
    }
  }
}

interface Stream {
  requests: Requests;
  abort: AbortController;
  read: ReturnType<typeof vi.fn<(absoluteNativePath: string) => Promise<Snapshot<string>>>>;
  close: ReturnType<typeof vi.fn>;
  notify: ChangeListener;
  seen: { relativePath: string; state: string }[];
  ended: Promise<void>;
}

/** Reads a file's content as its state. Returns `missing` if an error occurred. */
async function readContent(absoluteNativePath: string): Promise<Snapshot<string>> {
  const content = await fs.readFile(absoluteNativePath, 'utf8').catch(() => 'missing');
  return { key: content, state: content };
}

function start({ includesChildren = false, pollIntervalMs = 60_000 } = {}): Stream {
  const stream: Stream = {
    requests: new Requests(),
    abort: new AbortController(),
    read: vi.fn(readContent),
    close: vi.fn(),
    notify: () => {}, // Replaced later.
    seen: [], // Values captured by `watchPaths()`.
    ended: Promise.resolve(), // Replaced later.
  };
  streams.push(stream);

  const watcher = {
    watch: (_root: string, listener: ChangeListener) => {
      stream.notify = listener;
      return { close: stream.close };
    },
  } as unknown as DirectoryWatcher;
  const states = watchPaths(stream.requests, stream.abort.signal, {
    watcher,
    pollIntervalMs,
    debounceMs: DEBOUNCE_MS,
    includesChildren,
    snapshot: stream.read,
  });
  stream.ended = (async () => {
    for await (const state of states) {
      stream.seen.push(state);
    }
  })();
  stream.ended.catch(() => {});

  return stream;
}

function settleDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 5));
}

function at(...segments: string[]): string {
  return path.join(root, ...segments);
}

test('reports the state of each path when a request arrives', async () => {
  await fs.writeFile(at('a.txt'), 'A');
  const stream = start();

  // Note that values are immediately polled when the request arrive.
  stream.requests.push({ root, relativePaths: ['a.txt', 'missing.txt'] });

  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  expect(stream.seen).toContainEqual({ relativePath: 'a.txt', state: 'A' });
  expect(stream.seen).toContainEqual({ relativePath: 'missing.txt', state: 'missing' });
  expect(stream.read).toHaveBeenCalledWith(at('a.txt'));
});

test('reports a notified path again only when its state changes', async () => {
  await fs.writeFile(at('a.txt'), 'A');
  const stream = start();
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));

  stream.notify(['a.txt']);
  await vi.waitFor(() => expect(stream.read).toHaveBeenCalledTimes(2));
  await fs.writeFile(at('a.txt'), 'B');
  stream.notify(['a.txt']);

  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  expect(stream.seen).toEqual([
    { relativePath: 'a.txt', state: 'A' },
    { relativePath: 'a.txt', state: 'B' },
  ]);
});

test('reads every path of a repeated request again and reports only the ones that changed', async () => {
  await fs.writeFile(at('a.txt'), 'A');
  await fs.writeFile(at('b.txt'), 'B');
  const stream = start();
  stream.requests.push({ root, relativePaths: ['a.txt', 'b.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  stream.read.mockClear();
  await fs.writeFile(at('b.txt'), 'BB');

  stream.requests.push({ root, relativePaths: ['a.txt', 'b.txt'] });

  await vi.waitFor(() => expect(stream.seen).toHaveLength(3));
  expect(stream.seen.at(-1)).toEqual({ relativePath: 'b.txt', state: 'BB' });
  expect(stream.read).toHaveBeenCalledTimes(2);
});

test.each([
  [false, ['src/a.ts'], ['src/a.ts']],
  [true, ['src/a.ts'], ['src', 'src/a.ts']],
  [false, ['src'], ['src', 'src/a.ts']],
  [true, ['src'], ['', 'src', 'src/a.ts']],
])('with includesChildren %s, a notified change to %j is read for %j', async (includesChildren, changed, touched) => {
  const stream = start({ includesChildren });
  stream.requests.push({ root, relativePaths: ['', 'src', 'src/a.ts'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(3));
  stream.read.mockClear();

  stream.notify(changed);
  await settleDebounce();

  const absoluteNativePaths = stream.read.mock.calls.map(([absoluteNativePath]) => absoluteNativePath).sort();
  const expected = touched.map((relativeProtocolPath) => at(relativeProtocolPath));
  expect(absoluteNativePaths).toEqual(expected.sort());
});

test('gathers the changes notified within the debounce into one read', async () => {
  const stream = start();
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));
  stream.read.mockClear();

  stream.notify(['a.txt']);
  stream.notify(['a.txt']);
  await settleDebounce();

  expect(stream.read).toHaveBeenCalledTimes(1);
});

test('reads a path again when a change is notified while it is being read', async () => {
  await fs.writeFile(at('a.txt'), 'A');
  const stream = start();
  let finish: (() => void) | undefined;

  // Hangs a read until settled.
  stream.read.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { key: 'A', state: 'A' };
  });
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(finish).toBeDefined());

  await fs.writeFile(at('a.txt'), 'B');
  stream.notify(['a.txt']); // Races a notification while read is running.
  await settleDebounce();
  finish?.();

  await vi.waitFor(() => expect(stream.seen).toHaveLength(2));
  expect(stream.seen).toEqual([
    { relativePath: 'a.txt', state: 'A' },
    { relativePath: 'a.txt', state: 'B' },
  ]);
});

test('reads a path on the poll only once it changes without a notification', async () => {
  await fs.writeFile(at('a.txt'), 'A');
  const stream = start({ pollIntervalMs: 20 });
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(stream.read).toHaveBeenCalledTimes(1);

  await fs.writeFile(at('a.txt'), 'BB');

  await vi.waitFor(() => expect(stream.seen.at(-1)).toEqual({ relativePath: 'a.txt', state: 'BB' }));
});

test('drops a path a later request leaves out, even while it is being read', async () => {
  const stream = start();
  let finish: (() => void) | undefined;
  stream.read.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { key: 'late', state: 'late' };
  });
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(finish).toBeDefined());

  stream.requests.push({ root, relativePaths: ['b.txt'] });
  finish?.();

  await vi.waitFor(() => expect(stream.seen).toEqual([{ relativePath: 'b.txt', state: 'missing' }]));
  stream.notify(['a.txt']);
  await settleDebounce();
  expect(stream.read).toHaveBeenCalledTimes(2);
});

test('keeps the root for a later request that leaves it empty', async () => {
  await fs.writeFile(at('b.txt'), 'B');
  const stream = start();
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));

  stream.requests.push({ root: '', relativePaths: ['a.txt', 'b.txt'] });

  await vi.waitFor(() => expect(stream.seen.at(-1)).toEqual({ relativePath: 'b.txt', state: 'B' }));
  expect(stream.read).toHaveBeenCalledWith(at('b.txt'));
});

test('fails a later request that changes the root', async () => {
  const stream = start();
  stream.requests.push({ root, relativePaths: [] });

  stream.requests.push({ root: at('other'), relativePaths: [] });

  await expect(stream.ended).rejects.toThrow('a stream cannot change its root');
  expect(stream.close).toHaveBeenCalledTimes(1);
});

test('ends and closes the watch when the requests ends', async () => {
  const stream = start();
  stream.requests.push({ root, relativePaths: [] });

  stream.requests.end();

  await expect(stream.ended).resolves.toBeUndefined();
  expect(stream.close).toHaveBeenCalledTimes(1);
});

test('ends and closes the watch when aborted', async () => {
  const stream = start();
  stream.requests.push({ root, relativePaths: ['a.txt'] });
  await vi.waitFor(() => expect(stream.seen).toHaveLength(1));

  stream.abort.abort();

  await expect(stream.ended).resolves.toBeUndefined();
  expect(stream.close).toHaveBeenCalledTimes(1);
});

test('fails with the error a read throws and closes the watch', async () => {
  const stream = start();
  stream.read.mockRejectedValueOnce(new Error('boom'));

  stream.requests.push({ root, relativePaths: ['a.txt'] });

  await expect(stream.ended).rejects.toThrow('boom');
  expect(stream.close).toHaveBeenCalledTimes(1);
});
