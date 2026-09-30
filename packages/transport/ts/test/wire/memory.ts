import type { Wire } from '../../src';

/** An in-process wire for tests. */
export class MemoryWire implements Wire {
  onFrame: ((frame: Uint8Array) => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;
  peer!: MemoryWire;
  #open = true;

  send(frame: Uint8Array): void {
    if (!this.#open) return;
    queueMicrotask(() => {
      this.peer.onFrame?.(frame);
    });
  }

  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.peer.#open = false;
    this.onClosed?.();
    queueMicrotask(() => {
      this.peer.onClosed?.();
    });
  }
}

/** Creates a pair of `MemoryWire`. */
export function wirePair(): [MemoryWire, MemoryWire] {
  const a = new MemoryWire();
  const b = new MemoryWire();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
