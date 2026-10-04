import { describe, expect, test } from 'vitest';
import { AsyncQueue } from '../src/async-queue';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const received: T[] = [];
  for await (const value of iterable) {
    received.push(value);
  }
  return received;
}

// Resolves on a macrotask. This ensures every microtask has been drained.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('async queue', () => {
  test('yields pushed values in order and completes on end', async () => {
    const queue = new AsyncQueue<string>();
    queue.push('a');
    queue.push('b');
    queue.push('c');
    queue.end();
    expect(await collect(queue)).toEqual(['a', 'b', 'c']);
  });

  test('iterating an ended empty queue completes immediately', async () => {
    const queue = new AsyncQueue<string>();
    queue.end();
    expect(await collect(queue)).toEqual([]);
  });

  test('a long drain compacts the buffer without losing or reordering values', async () => {
    // 2048 buffered with 1100 consumed crosses #poll's 1024-slot compaction threshold mid-buffer.
    const queue = new AsyncQueue<number>();
    for (let value = 0; value < 2048; value += 1) {
      queue.push(value);
    }

    const iterator = queue[Symbol.asyncIterator]();
    const received: number[] = [];
    for (let taken = 0; taken < 1100; taken += 1) {
      received.push((await iterator.next()).value);
    }

    for (let value = 2048; value < 2560; value += 1) {
      queue.push(value);
    }
    queue.end();

    while (true) {
      const result = await iterator.next();
      if (result.done) {
        break;
      }
      received.push(result.value);
    }
    expect(received).toEqual(Array.from({ length: 2560 }, (_, value) => value));
  });

  test('two consumers parked on an empty queue each receive a push, then both complete on end', async () => {
    const queue = new AsyncQueue<string>();
    const first = queue[Symbol.asyncIterator]();
    const second = queue[Symbol.asyncIterator]();
    const takes = [first.next(), second.next()];

    queue.push('a');
    queue.push('b');
    const results = await Promise.all(takes);
    expect(results.map((result) => result.done)).toEqual([false, false]);
    expect(results.map((result) => result.value)).toEqual(['a', 'b']);

    queue.end();
    expect((await first.next()).done).toBe(true);
    expect((await second.next()).done).toBe(true);
  });

  test('two consumers parked on an empty queue both settle on fail', async () => {
    const queue = new AsyncQueue<string>();
    const error = new Error('wire down');
    const first = queue[Symbol.asyncIterator]().next();
    const second = queue[Symbol.asyncIterator]().next();
    queue.fail(error);
    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
  });

  test('two consumers parked on an empty queue both settle on abort', async () => {
    const queue = new AsyncQueue<string>();
    const error = new Error('cancelled');
    const first = queue[Symbol.asyncIterator]().next();
    const second = queue[Symbol.asyncIterator]().next();
    queue.abort(error);
    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
  });

  test('fail drains buffered values before throwing', async () => {
    const queue = new AsyncQueue<string>();
    const error = new Error('wire down');
    queue.push('a');
    queue.push('b');
    queue.fail(error);
    const received: string[] = [];

    await expect(
      (async () => {
        for await (const value of queue) {
          received.push(value);
        }
      })(),
    ).rejects.toBe(error);
    expect(received).toEqual(['a', 'b']);
  });

  test('abort discards buffered values and throws immediately', async () => {
    const queue = new AsyncQueue<string>();
    const error = new Error('cancelled');
    queue.push('a');
    queue.push('b');
    queue.abort(error);
    const received: string[] = [];

    await expect(
      (async () => {
        for await (const value of queue) {
          received.push(value);
        }
      })(),
    ).rejects.toBe(error);
    expect(received).toEqual([]);
  });

  test('push after end delivers nothing', async () => {
    const queue = new AsyncQueue<string>();
    queue.end();
    queue.push('late');
    expect(await collect(queue)).toEqual([]);
  });

  test('fail and abort after done is set are no-ops', async () => {
    const queue = new AsyncQueue<string>();
    const error = new Error('first');
    queue.fail(error);
    queue.abort(new Error('second'));
    queue.end();
    await expect(collect(queue)).rejects.toBe(error);

    const ended = new AsyncQueue<string>();
    ended.end();
    ended.fail(new Error('too late'));
    expect(await collect(ended)).toEqual([]);
  });

  test('a consumer beaten to a push re-parks and receives the following value', async () => {
    const queue = new AsyncQueue<string>();
    const first = queue[Symbol.asyncIterator]();
    const second = queue[Symbol.asyncIterator]();
    const takes = [first.next(), second.next()];
    const outcomes = takes.map(() => undefined as string | undefined);
    for (const [index, take] of takes.entries()) {
      take.then((result) => {
        outcomes[index] = result.value;
      });
    }

    // One push wakes both parked consumers but feeds only the first to park. The other must re-park.
    queue.push('first');
    await settled();
    expect(outcomes).toEqual(['first', undefined]);

    queue.push('second');
    await settled();
    expect(outcomes).toEqual(['first', 'second']);
  });

  test('return() while parked settles only after the queue wakes', async () => {
    const queue = new AsyncQueue<string>();
    const iterator = queue[Symbol.asyncIterator]();
    const parked = iterator.next();
    let closed = false;
    const closing = iterator.return?.().then((result) => {
      closed = true;
      return result;
    });

    await settled();
    expect(closed).toBe(false);

    queue.push('wake');
    expect(await parked).toEqual({ value: 'wake', done: false });
    expect(await closing).toEqual({ value: undefined, done: true });
  });

  test('a queue of undefined values still yields them', async () => {
    const queue = new AsyncQueue<undefined>();
    queue.push(undefined);
    queue.push(undefined);
    queue.end();

    const received = await collect(queue);
    expect(received).toHaveLength(2);
    expect(received).toEqual([undefined, undefined]);
  });
});
