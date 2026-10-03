import { create, toBinary } from '@bufbuild/protobuf';
import { EnvelopeSchema } from '../gen/elsewise/transport/v1/envelope_pb';
import type { Wire } from './index';

/** The outbound bytes a socket may buffer before the wire stops being writable. */
export const DEFAULT_HIGH_WATER_MARK = 256 * 1024;

/** WebSocket and an RTCDataChannel shared interface. */
export interface Socket {
  binaryType: string;
  // WebSocket counts its states (0 to 3), RTCDataChannel names them ('connecting' to 'closed').
  readonly readyState: number | string;
  readonly bufferedAmount: number; // The bytes sent but not yet handed to the network.
  send(data: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void, options?: { once?: boolean }): void;
  addEventListener(
    type: 'close',
    listener: (event: { type: string; reason?: string }) => void,
    options?: { once?: boolean },
  ): void;
}

export interface SocketWireOptions {
  /**
   * How many outbound bytes the socket may buffer before the wire stops being writable.
   *
   * Defaults to `DEFAULT_HIGH_WATER_MARK`.
   */
  highWaterMark?: number;
}

export const PING = heartbeat('ping');
export const PONG = heartbeat('pong');

function heartbeat(body: 'ping' | 'pong'): Uint8Array<ArrayBuffer> {
  return toBinary(
    EnvelopeSchema,
    create(EnvelopeSchema, { kind: { case: 'heartbeat', value: { body: { case: body, value: {} } } } }),
  );
}

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Resolves once the socket is open, or rejects with the close reason if it closes first. */
export function opened<S extends Socket>(socket: S): Promise<S> {
  return new Promise((resolve, reject) => {
    switch (socket.readyState) {
      case 1:
      case 'open':
        resolve(socket);
        break;
      case 0:
      case 'connecting':
        socket.addEventListener('open', () => resolve(socket), { once: true });
        socket.addEventListener('close', (event) => reject(new Error(event.reason || 'socket closed')), { once: true });
        break;
      default:
        reject(new Error('socket closed'));
    }
  });
}

/**
 * The shared implementation across socket wires.
 */
export abstract class SocketWire implements Wire {
  onFrame: ((frame: Uint8Array) => void) | null = null;
  onDrain: (() => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;
  protected readonly socket: Socket;
  protected readonly highWaterMark: number;
  #open = true;

  protected constructor(socket: Socket, options?: SocketWireOptions) {
    this.socket = socket;
    this.highWaterMark = options?.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', (event) => {
      if (!this.#open) return;
      if (event.data instanceof ArrayBuffer) {
        this.receive(new Uint8Array(event.data));
        return;
      }
      // Invalid protocol detected.
      this.close(1000, 'binary messages only');
    });
    // The socket is already closed here, so closing it again is a no-op; this only notifies.
    socket.addEventListener('close', (event) => this.close(undefined, event.reason || undefined));
  }

  protected get open(): boolean {
    return this.#open;
  }

  protected get lowWaterMark(): number {
    return Math.floor(this.highWaterMark / 2);
  }

  protected receive(frame: Uint8Array): void {
    if (equals(frame, PING)) this.send(PONG);
    else if (!equals(frame, PONG)) this.onFrame?.(frame);
  }

  /**
   * Called after a send left the wire full.
   *
   * Typically used to call `drained()` when the buffer reaches `lowWaterMark`.
   */
  protected abstract watchDrain(): void;

  /** Reports the drain, unless the wire closed meanwhile. */
  protected drained(): void {
    if (this.#open) this.onDrain?.();
  }

  get writable(): boolean {
    return this.#open && this.socket.bufferedAmount < this.highWaterMark;
  }

  send(frame: Uint8Array<ArrayBuffer>): void {
    if (!this.#open) return;
    this.socket.send(frame);
    if (!this.writable) this.watchDrain();
  }

  close(code?: number, reason?: string): void {
    if (!this.#open) return;
    this.#open = false;
    this.socket.close(code, reason);
    this.onClosed?.(reason);
  }
}
