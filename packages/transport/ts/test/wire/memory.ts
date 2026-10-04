import type { Wire } from '../../src';

/**
 * An in-process wire for tests.
 *
 * With a finite `capacity` it holds that many frames before reporting full, and delivers them only when `drain()` is
 * called.
 */
export class MemoryWire implements Wire {
  onFrame: ((frame: Uint8Array) => void) | null = null;
  onDrain: (() => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;
  peer!: MemoryWire;
  readonly #capacity: number;
  #held: Uint8Array[] = [];
  #open = true;

  constructor(capacity = Number.POSITIVE_INFINITY) {
    this.#capacity = capacity;
  }

  get writable(): boolean {
    return this.#open && this.#held.length < this.#capacity;
  }

  send(frame: Uint8Array): void {
    if (!this.#open) {
      return;
    }
    if (this.#capacity === Number.POSITIVE_INFINITY) {
      this.#deliver(frame);
      return;
    }
    this.#held.push(frame);
  }

  drain(): void {
    const frames = this.#held;
    this.#held = [];
    for (const frame of frames) {
      this.#deliver(frame);
    }
    if (this.#open) {
      this.onDrain?.();
    }
  }

  #deliver(frame: Uint8Array): void {
    queueMicrotask(() => {
      this.peer.onFrame?.(frame);
    });
  }

  close(): void {
    if (!this.#open) {
      return;
    }
    this.#open = false;
    this.#held = [];
    this.peer.#open = false;
    this.onClosed?.();
    queueMicrotask(() => {
      this.peer.onClosed?.();
    });
  }
}

/** Creates a pair of `MemoryWire`. */
export function wirePair(capacity?: number): [MemoryWire, MemoryWire] {
  const a = new MemoryWire(capacity);
  const b = new MemoryWire(capacity);
  a.peer = b;
  b.peer = a;
  return [a, b];
}
