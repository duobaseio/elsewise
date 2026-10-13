import { Channel, createClient, WebSocketWire } from '@elsewise/transport';
import { afterEach, beforeEach, expect, test } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { createDaemon } from '../src/daemon';
import { InfoService } from '../src/gen/elsewise/daemon/v1/info_service_pb';
import { PROTOCOL, startWebSocketServer, TOKEN_PREFIX, type WebSocketServerHandle } from '../src/websocket';

const TOKEN = 'test-token';
const BEARER = TOKEN_PREFIX + TOKEN;

let server: WebSocketServerHandle;
let url: string;

beforeEach(async () => {
  server = await startWebSocketServer(createDaemon(), { port: 0, token: TOKEN });
  url = `ws://127.0.0.1:${server.port}`;
});

afterEach(async () => {
  await server.close();
});

test('serves a client that offers the protocol and the token', async () => {
  const channel = new Channel(await WebSocketWire.open(new WebSocket(url, [PROTOCOL, BEARER])));
  const client = createClient(channel, InfoService);

  await expect(client.getInfo({})).resolves.toMatchObject({ version: manifest.version });

  channel.close();
});

test('selects the protocol and not the token', async () => {
  const socket = new WebSocket(url, [BEARER, PROTOCOL]);
  const wire = await WebSocketWire.open(socket);

  expect(socket.protocol).toBe(PROTOCOL);

  wire.close();
});

test('refuses a client that offers the wrong token', async () => {
  await expect(WebSocketWire.open(new WebSocket(url, [PROTOCOL, `${TOKEN_PREFIX}wrong-token`]))).rejects.toThrow();
});

test('refuses a client that offers no token', async () => {
  await expect(WebSocketWire.open(new WebSocket(url, [PROTOCOL]))).rejects.toThrow();
});

test('refuses a client that offers the token without the protocol', async () => {
  await expect(WebSocketWire.open(new WebSocket(url, [BEARER]))).rejects.toThrow();
});

test('refuses a client that offers no subprotocol', async () => {
  await expect(WebSocketWire.open(new WebSocket(url))).rejects.toThrow();
});

test.each(['', 'has space', 'a/b=', 'a,b'])('refuses to start with the token %j', async (token) => {
  await expect(startWebSocketServer(createDaemon(), { port: 0, token })).rejects.toThrow();
});
