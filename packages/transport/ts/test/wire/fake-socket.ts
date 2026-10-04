import type { DataChannel, Socket } from '../../src';

/** Represents a fake socket. */
export class FakeSocket implements Socket {
  binaryType = '';
  readyState = 1;
  bufferedAmount = 0;
  sent: Uint8Array[] = [];
  closed: [number | undefined, string | undefined] | undefined;
  #listeners = new Map<string, ((event: never) => void)[]>();

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = [code, reason];
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  deliver(frame: Uint8Array): void {
    const data = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    for (const listener of this.#listeners.get('message') ?? []) {
      listener({ data } as never);
    }
  }

  emit(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(undefined as never);
    }
  }
}

/** Represents a fake RTCDataChannel socket. */
export class FakeDataChannel extends FakeSocket implements DataChannel {
  bufferedAmountLowThreshold = 0;
}
