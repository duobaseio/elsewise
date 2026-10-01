import { create, toBinary } from '@bufbuild/protobuf';
import { EnvelopeSchema } from '../gen/elsewise/transport/v1/envelope_pb';
import type { Wire } from './index';

export const DEFAULT_HEARTBEAT_MS = 15_000;

const PING = heartbeat('ping');
const PONG = heartbeat('pong');

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

/** An open socket carrying binary messages. (WebSocket and RTCDataChannel implement these methods) */
export interface Socket {
  binaryType: string;
  // WebSocket counts its states (0 to 3), RTCDataChannel names them ('connecting' to 'closed').
  readonly readyState: number | string;
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
   * How often to probe the peer, in milliseconds, or `false` to disable liveness checks.
   *
   * Defaults to `DEFAULT_HEARTBEAT_MS`.
   */
  heartbeat?: number | false;
}

/** The `Wire` over an open socket. */
export class SocketWire implements Wire {
  onFrame: ((frame: Uint8Array) => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;
  readonly #socket: Socket;
  #open = true;

  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #heard = true; // Whether any message arrived since the last probe.

  /** Resolves to a wire once the socket is open, or rejects with the close reason if it closes. */
  static open(socket: Socket, options?: SocketWireOptions): Promise<SocketWire> {
    return new Promise((resolve, reject) => {
      switch (socket.readyState) {
        case 1:
        case 'open':
          resolve(new SocketWire(socket, options));
          break;
        case 0:
        case 'connecting':
          socket.addEventListener('open', () => resolve(new SocketWire(socket, options)), { once: true });
          socket.addEventListener('close', (event) => reject(new Error(event.reason || 'socket closed')), {
            once: true,
          });
          break;
        default:
          reject(new Error('socket closed'));
      }
    });
  }

  constructor(socket: Socket, options?: SocketWireOptions) {
    this.#socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', (event) => {
      if (!this.#open) return;
      if (event.data instanceof ArrayBuffer) {
        this.#heard = true;
        const frame = new Uint8Array(event.data);
        if (equals(frame, PING)) {
          this.send(PONG);
        } else if (!equals(frame, PONG)) {
          this.onFrame?.(frame);
        }
        return;
      }
      // Invalid protocol detected.
      this.close(1000, 'binary messages only');
    });
    // The socket is already closed here, so closing it again is a no-op; this only notifies.
    socket.addEventListener('close', (event) => this.close(undefined, event.reason || undefined));
    const heartbeat = options?.heartbeat ?? DEFAULT_HEARTBEAT_MS;
    if (heartbeat !== false) this.#startHeartbeat(heartbeat);
  }

  #startHeartbeat(interval: number): void {
    const timer = setInterval(() => {
      if (!this.#heard) {
        this.close(1000, 'heartbeat timeout');
        return;
      }
      this.#heard = false;
      this.send(PING);
    }, interval);
    // Check ensures that the runtime is node before calling unref().
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    this.#heartbeat = timer;
  }

  send(frame: Uint8Array<ArrayBuffer>): void {
    if (this.#open) this.#socket.send(frame);
  }

  close(code?: number, reason?: string): void {
    if (!this.#open) return;
    this.#open = false;
    clearInterval(this.#heartbeat);
    this.#socket.close(code, reason);
    this.onClosed?.(reason);
  }
}
