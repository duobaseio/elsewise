import * as z from 'zod';

export type DaemonConnection = z.infer<typeof DaemonConnection>;

/**
 * The local daemon.
 */
export interface DaemonBridge {
  /**
   * Returns the daemon's connection once it has started.
   *
   * Throws an error if the daemon fails to start.
   */
  connection(): Promise<DaemonConnection>;
}

/**
 * A connection to the daemon's WebSocket on loopback.
 */
export const DaemonConnection = z.object({
  /**
   * The port the daemon listens on.
   */
  port: z.number().int().min(1).max(65535),
  /**
   * The token the daemon expects.
   */
  token: z.string().regex(/^[\w-]+$/),
});
