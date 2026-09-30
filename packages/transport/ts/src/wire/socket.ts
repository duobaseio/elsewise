import type { Wire } from './index';

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

/** The `Wire` over an open socket. */
export class SocketWire implements Wire {
  onFrame: ((frame: Uint8Array) => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;
  readonly #socket: Socket;
  #open = true;

  /** Resolves to a wire once the socket is open, or rejects with the close reason if it closes. */
  static open(socket: Socket): Promise<SocketWire> {
    return new Promise((resolve, reject) => {
      switch (socket.readyState) {
        case 1:
        case 'open':
          resolve(new SocketWire(socket));
          break;
        case 0:
        case 'connecting':
          socket.addEventListener('open', () => resolve(new SocketWire(socket)), { once: true });
          socket.addEventListener('close', (event) => reject(new Error(event.reason || 'socket closed')), {
            once: true,
          });
          break;
        default:
          reject(new Error('socket closed'));
      }
    });
  }

  constructor(socket: Socket) {
    this.#socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', (event) => {
      if (!this.#open) return;
      if (event.data instanceof ArrayBuffer) {
        this.onFrame?.(new Uint8Array(event.data));
        return;
      }
      // Invalid protocol detected.
      this.close(1000, 'binary messages only');
    });
    // The socket is already closed here, so closing it again is a no-op; this only notifies.
    socket.addEventListener('close', (event) => this.close(undefined, event.reason || undefined));
  }

  send(frame: Uint8Array<ArrayBuffer>): void {
    if (this.#open) this.#socket.send(frame);
  }

  close(code?: number, reason?: string): void {
    if (!this.#open) return;
    this.#open = false;
    this.#socket.close(code, reason);
    this.onClosed?.(reason);
  }
}
