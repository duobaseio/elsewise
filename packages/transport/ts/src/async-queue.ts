/**
 * An asynchronously iterable queue which is safe for any number of concurrent consumers.
 *
 * The queue performs a fan-out and NOT broadcast (each value goes to exactly one consumer).
 *
 * Ordering is approximately round-robin which ensures fairness between concurrent consumers (FIFO waiters + FIFO
 * microtasks, and the winner re-queues behind the losers). This works because an AsyncIterator requires an await for
 * next() and causes the next iteration of the loop to be placed at the back of the FIFO microtask.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  #buffered: T[] = [];
  #head = 0;
  #done = false;
  #failure: Error | undefined;
  #waiters: (() => void)[] = [];

  /** Delivers one value. */
  push(value: T): void {
    if (this.#done) {
      return;
    }
    this.#buffered.push(value);
    this.#wake();
  }

  /** Ends the queue normally. */
  end(): void {
    if (this.#done) {
      return;
    }
    this.#done = true;
    this.#wake();
  }

  /** Ends the queue with an error, thrown to the consumer once the buffered values have drained. */
  fail(error: Error): void {
    if (this.#done) {
      return;
    }
    this.#done = true;
    this.#failure = error;
    this.#wake();
  }

  /** Ends the queue with an error thrown immediately: buffered values are discarded, not drained. */
  abort(error: Error): void {
    if (this.#done) {
      return;
    }
    this.#buffered = [];
    this.#head = 0;
    this.fail(error);
  }

  #wake(): void {
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  /**
   * Takes the oldest buffered value.
   *
   * Consumed slots are dropped in bulk here rather than shifted one at a time, keeping a long drain linear and O(1)
   * amortized per poll.
   */
  #poll(): { value: T } | undefined {
    if (this.#head === this.#buffered.length) {
      return undefined;
    }

    const value = this.#buffered[this.#head] as T;
    this.#head += 1;

    if (this.#head === this.#buffered.length) {
      this.#buffered = [];
      this.#head = 0;
    } else if (this.#head >= 1024 && this.#head * 2 >= this.#buffered.length) {
      this.#buffered = this.#buffered.slice(this.#head);
      this.#head = 0;
    }

    return { value };
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const next = this.#poll();
      if (next) {
        yield next.value;
        continue;
      }
      if (this.#done) {
        if (this.#failure) {
          throw this.#failure;
        }
        return;
      }
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
      });
    }
  }
}
