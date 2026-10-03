import { opened, PING, type Socket, SocketWire, type SocketWireOptions } from './socket';

export const DEFAULT_HEARTBEAT_MS = 15_000;

const DRAIN_POLL_MS = 5;

export interface WebSocketWireOptions extends SocketWireOptions {
  /**
   * How often to probe the peer, in milliseconds.
   *
   * Defaults to `DEFAULT_HEARTBEAT_MS`.
   */
  heartbeat?: number;
}

/**
 * The `Wire` over an open WebSocket.
 */
export class WebSocketWire extends SocketWire {
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #heard = true; // Whether any message arrived since the last probe.
  #drainPoll: ReturnType<typeof setInterval> | undefined;

  /** Resolves to a wire once the socket is open. */
  static open(socket: Socket, options?: WebSocketWireOptions): Promise<WebSocketWire> {
    return opened(socket).then((socket) => new WebSocketWire(socket, options));
  }

  constructor(socket: Socket, options?: WebSocketWireOptions) {
    super(socket, options);
    this.#startHeartbeat(options?.heartbeat ?? DEFAULT_HEARTBEAT_MS);
  }

  /** Notes that the peer is alive, then lets the base handle the frame. */
  protected override receive(frame: Uint8Array): void {
    this.#heard = true;
    super.receive(frame);
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
    timer.unref?.(); // Never holds a Node process open.
    this.#heartbeat = timer;
  }

  protected override watchDrain(): void {
    if (this.#drainPoll !== undefined) return;
    const timer = setInterval(() => {
      if (this.open && this.socket.bufferedAmount > this.lowWaterMark) return;
      clearInterval(timer);
      this.#drainPoll = undefined;
      this.drained();
    }, DRAIN_POLL_MS);
    timer.unref?.(); // Never holds a Node process open.
    this.#drainPoll = timer;
  }

  override close(code?: number, reason?: string): void {
    clearInterval(this.#heartbeat);
    clearInterval(this.#drainPoll);
    super.close(code, reason);
  }
}
