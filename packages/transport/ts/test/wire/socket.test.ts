import { once } from 'node:events';
import { create, toBinary } from '@bufbuild/protobuf';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type WebSocket as ServerSocket, WebSocketServer } from 'ws';
import { Channel, Code, MAX_FRAGMENT_BYTES, type Socket, SocketWire } from '../../src';
import { EnvelopeSchema } from '../../src/gen/elsewise/transport/v1/envelope_pb';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function collect(messages: AsyncIterable<Uint8Array>): Promise<string[]> {
  const received: string[] = [];
  for await (const message of messages) received.push(decode(message));
  return received;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

type Server = { wss: WebSocketServer; url: string };

/** A listening ws server over loopback and its url. */
async function createServer(options: { verifyClient?: () => boolean } = {}): Promise<Server> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, ...options });
  servers.push(wss);
  await once(wss, 'listening');
  const address = wss.address();
  if (typeof address !== 'object' || address === null) throw new Error('unexpected address');
  return { wss, url: `ws://127.0.0.1:${address.port}` };
}

/** Connects to the given server and returns the client and server sockets. */
async function connect({ wss, url }: Server): Promise<{ client: WebSocket; server: ServerSocket }> {
  const client = new WebSocket(url);
  const [[server]] = await Promise.all([once(wss, 'connection'), once(client, 'open')]);
  // ServerSocket refers to the particular connection to the corresponding client.
  return { client, server: server as ServerSocket };
}

async function pair(): Promise<{ front: Channel; daemon: Channel }> {
  const { client, server } = await connect(await createServer());
  return {
    front: new Channel(new SocketWire(client)),
    daemon: new Channel(new SocketWire(server), { parity: 'even' }),
  };
}

function heartbeat(body: 'ping' | 'pong'): Uint8Array {
  return toBinary(
    EnvelopeSchema,
    create(EnvelopeSchema, { kind: { case: 'heartbeat', value: { body: { case: body, value: {} } } } }),
  );
}

const PING = heartbeat('ping');
const PONG = heartbeat('pong');

class FakeSocket implements Socket {
  binaryType = '';
  readyState = 1;
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
    for (const listener of this.#listeners.get('message') ?? []) listener({ data } as never);
  }
}

function serveEcho(channel: Channel): void {
  channel.handle('svc/Echo', async (stream) => {
    for await (const message of stream.requests) stream.send(message);
  });
}

describe('socket wire', () => {
  describe('open', () => {
    test('opens once the socket connects', async () => {
      const { wss, url } = await createServer();
      const client = new WebSocket(url);
      expect(client.readyState).toBe(WebSocket.CONNECTING);
      const [wire] = await Promise.all([SocketWire.open(client), once(wss, 'connection')]);
      expect(wire).toBeInstanceOf(SocketWire);
    });

    test('opens over a socket that is live', async () => {
      const { client } = await connect(await createServer());
      await expect(SocketWire.open(client)).resolves.toBeInstanceOf(SocketWire);
    });

    test('rejects when the socket closes before opening', async () => {
      const { url } = await createServer({ verifyClient: () => false });
      await expect(SocketWire.open(new WebSocket(url))).rejects.toThrow();
    });

    test('rejects a socket that is already closed', async () => {
      const { client } = await connect(await createServer());
      client.close();
      await once(client, 'close');
      await expect(SocketWire.open(client)).rejects.toThrow('socket closed');
    });
  });

  describe('frames', () => {
    test('frames are views of the socket message', async () => {
      const { client, server } = await connect(await createServer());
      const wire = new SocketWire(client);
      const frame = deferred<Uint8Array>();
      wire.onFrame = (received) => frame.resolve(received);
      server.send(new Uint8Array([1, 2, 3]));
      expect(Array.from(await frame.promise)).toEqual([1, 2, 3]);
    });

    test('a text message closes the wire as unsupported data', async () => {
      const { client, server } = await connect(await createServer());
      const wire = new SocketWire(client);
      const closed = deferred<string | undefined>();
      wire.onClosed = (reason) => closed.resolve(reason);
      const serverClosed = once(server, 'close');
      server.send('hello');
      expect(await closed.promise).toBe('binary messages only');
      const [code, reason] = await serverClosed;
      expect([code, reason.toString()]).toEqual([1000, 'binary messages only']);
    });
  });

  describe('closing', () => {
    test('closing sends a close frame and notifies once', async () => {
      const { client, server } = await connect(await createServer());
      const wire = new SocketWire(client);
      let notified = 0;
      wire.onClosed = () => {
        notified += 1;
      };
      const serverClosed = once(server, 'close');
      const clientClosed = once(client, 'close');
      wire.close();
      wire.close();
      wire.send(new Uint8Array([1]));
      const [code] = await serverClosed;
      expect(code).toBe(1005);
      await clientClosed;
      expect(notified).toBe(1);
    });

    test('the socket dropping fails pending calls with CODE_UNAVAILABLE', async () => {
      const { client, server } = await connect(await createServer());
      const front = new Channel(new SocketWire(client));
      const stream = front.open('svc/Echo');
      const pending = collect(stream.responses);
      server.terminate();
      await expect(pending).rejects.toMatchObject({ code: Code.UNAVAILABLE });
    });
  });

  describe('heartbeat', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('probes every interval and answers the peer', () => {
      const socket = new FakeSocket();
      const wire = new SocketWire(socket, { heartbeat: 1000 });
      const frames: Uint8Array[] = [];
      wire.onFrame = (frame) => frames.push(frame);
      vi.advanceTimersByTime(1000);
      expect(socket.sent).toEqual([PING]);
      socket.deliver(PING);
      socket.deliver(PONG);
      expect(socket.sent).toEqual([PING, PONG]);
      expect(frames).toEqual([]); // Neither reaches the channel.
      vi.advanceTimersByTime(1000);
      expect(socket.sent).toEqual([PING, PONG, PING]);
    });

    test('a silent peer closes the wire after two intervals', () => {
      const socket = new FakeSocket();
      const wire = new SocketWire(socket, { heartbeat: 1000 });
      let reason: string | undefined;
      wire.onClosed = (r) => {
        reason = r;
      };
      vi.advanceTimersByTime(1999);
      expect(socket.closed).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect(socket.closed).toEqual([1000, 'heartbeat timeout']);
      expect(reason).toBe('heartbeat timeout');
      vi.advanceTimersByTime(5000);
      expect(socket.sent).toEqual([PING]); // No probes after closing.
    });

    test('any message counts as hearing the peer', () => {
      const socket = new FakeSocket();
      const wire = new SocketWire(socket, { heartbeat: 1000 });
      wire.onFrame = () => {};
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
        socket.deliver(new Uint8Array([1, 2, 3]));
      }
      expect(socket.closed).toBeUndefined();
    });

    test('false never probes but still answers', () => {
      const socket = new FakeSocket();
      new SocketWire(socket, { heartbeat: false });
      vi.advanceTimersByTime(60_000);
      expect(socket.sent).toEqual([]);
      expect(socket.closed).toBeUndefined();
      socket.deliver(PING);
      expect(socket.sent).toEqual([PONG]);
    });

    test('closing stops the probes', () => {
      const socket = new FakeSocket();
      const wire = new SocketWire(socket, { heartbeat: 1000 });
      wire.close();
      vi.advanceTimersByTime(3000);
      expect(socket.sent).toEqual([]);
    });
  });

  describe('integration', () => {
    test('carries calls end to end', async () => {
      const { front, daemon } = await pair();
      serveEcho(daemon);
      const stream = front.open('svc/Echo');
      stream.send(encode('one'));
      stream.send(encode('two'));
      stream.close();
      expect(await collect(stream.responses)).toEqual(['one', 'two']);
    });

    test('carries a message spanning several fragments', async () => {
      const { front, daemon } = await pair();
      serveEcho(daemon);
      const message = new Uint8Array(MAX_FRAGMENT_BYTES * 3 + 1).fill(7);
      const stream = front.open('svc/Echo');
      stream.send(message);
      stream.close();
      const [echoed] = await collect(stream.responses);
      expect(echoed).toBe(decode(message));
    });
  });
});
