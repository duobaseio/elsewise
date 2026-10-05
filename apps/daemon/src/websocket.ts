import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Channel, WebSocketWire } from '@elsewise/transport';
import { WebSocketServer } from 'ws';
import type { Daemon } from './daemon';

export const PROTOCOL = 'elsewise.daemon.v1';
export const TOKEN_PREFIX = 'elsewise.daemon.token.';

export interface WebSocketServerOptions {
  /**
   * The loopback port to listen on.
   *
   * 0 picks a random available port.
   */
  port: number;

  /** The token for authentication. */
  token: string;
}

export interface WebSocketServerHandle {
  /** The port the daemon is listening on. */
  port: number;

  /** Stops listening and drops every connection. */
  close(): Promise<void>;
}

/** Serves the daemon to WebSocket clients on loopback. */
export async function startWebSocketServer(
  daemon: Daemon,
  { port, token }: WebSocketServerOptions,
): Promise<WebSocketServerHandle> {
  if (!/^[\w-]+$/.test(token)) {
    throw new Error('The token may only contain letters, digits, "_" and "-".');
  }

  const server = new WebSocketServer({
    host: '127.0.0.1',
    port,
    verifyClient: ({ req }: { req: IncomingMessage }) => authenticate(req, token),
    handleProtocols: () => PROTOCOL,
  });
  server.on('connection', (socket) => {
    daemon.register(new Channel(new WebSocketWire(socket), { parity: 'even' }));
  });
  await once(server, 'listening');

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      for (const client of server.clients) {
        client.terminate();
      }
      server.close();
      await once(server, 'close');
    },
  };
}

/** Authenticate the client. */
function authenticate(request: IncomingMessage, token: string): boolean {
  const offered = (request.headers['sec-websocket-protocol'] ?? '').split(',').map((protocol) => protocol.trim());
  const expected = Buffer.from(TOKEN_PREFIX + token);
  const bearer = offered.some((protocol) => {
    const entry = Buffer.from(protocol);
    return entry.length === expected.length && timingSafeEqual(entry, expected);
  });
  return bearer && offered.includes(PROTOCOL);
}
