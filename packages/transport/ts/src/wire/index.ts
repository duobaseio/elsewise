/**
 * The byte pipe a Channel multiplexes over: a WebSocket or WebRTC data channel.
 */
export interface Wire {
  /** Sends one frame. */
  send(frame: Uint8Array<ArrayBuffer>): void;

  /** Closes the pipe. Closing an already-closed wire is a no-op. */
  close(): void;

  /** Calls it once per incoming frame. */
  onFrame: ((frame: Uint8Array) => void) | null;

  /** Calls it once when the pipe is closed, whichever side closed it. */
  onClosed: ((reason?: string) => void) | null;
}
