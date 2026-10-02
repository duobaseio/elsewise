import { once } from 'node:events';
import { create, toBinary } from '@bufbuild/protobuf';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type WebSocket as ServerSocket, WebSocketServer } from 'ws';
import { Channel, Code, WebSocketWire } from '../../src';
import { EnvelopeSchema } from '../../src/gen/elsewise/transport/v1/envelope_pb';
import { FakeSocket } from './fake-socket';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function collect(messages: AsyncIterable<Uint8Array>): Promise<string[]> {
  const received: string[] = [];
  for await (const message of messages) {
    received.push(decode(message));
  }
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
    for (const client of server.clients) {
      client.terminate();
    }
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
  if (typeof address !== 'object' || address === null) {
    throw new Error('unexpected address');
  }
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
    front: new Channel(new WebSocketWire(client)),
    daemon: new Channel(new WebSocketWire(server), { parity: 'even' }),
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

function serveEcho(channel: Channel): void {
  channel.handle('svc/Echo', async (stream) => {
    for await (const message of stream.requests) {
      stream.send(message);
    }
  });
}

describe('websocket wire', () => {
  describe('open', () => {
    test('opens once the socket connects', async () => {
      const { wss, url } = await createServer();
      const client = new WebSocket(url);
      expect(client.readyState).toBe(WebSocket.CONNECTING);
      const [wire] = await Promise.all([WebSocketWire.open(client), once(wss, 'connection')]);
      expect(wire).toBeInstanceOf(WebSocketWire);
    });

    test('opens over a socket that is live', async () => {
      const { client } = await connect(await createServer());
      await expect(WebSocketWire.open(client)).resolves.toBeInstanceOf(WebSocketWire);
    });

    test('rejects when the socket closes before opening', async () => {
      const { url } = await createServer({ verifyClient: () => false });
      await expect(WebSocketWire.open(new WebSocket(url))).rejects.toThrow();
    });

    test('rejects a socket that is already closed', async () => {
      const { client } = await connect(await createServer());
      client.close();
      await once(client, 'close');
      await expect(WebSocketWire.open(client)).rejects.toThrow('socket closed');
    });
  });

  describe('frames', () => {
    test('frames are views of the socket message', async () => {
      const { client, server } = await connect(await createServer());
      const wire = new WebSocketWire(client);
      const frame = deferred<Uint8Array>();
      wire.onFrame = (received) => frame.resolve(received);
      server.send(new Uint8Array([1, 2, 3]));
      expect(Array.from(await frame.promise)).toEqual([1, 2, 3]);
    });

    test('a text message closes the wire as unsupported data', async () => {
      const { client, server } = await connect(await createServer());
      const wire = new WebSocketWire(client);
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
      const wire = new WebSocketWire(client);
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
      const front = new Channel(new WebSocketWire(client));
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
      const wire = new WebSocketWire(socket, { heartbeat: 1000 });
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
      const wire = new WebSocketWire(socket, { heartbeat: 1000 });
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
      const wire = new WebSocketWire(socket, { heartbeat: 1000 });
      wire.onFrame = () => {};
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
        socket.deliver(new Uint8Array([1, 2, 3]));
      }
      expect(socket.closed).toBeUndefined();
    });
  });

  describe('backpressure', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test('writable follows the buffered amount against the high-water mark', () => {
      const socket = new FakeSocket();
      const wire = new WebSocketWire(socket, { highWaterMark: 100 });
      expect(wire.writable).toBe(true);
      socket.bufferedAmount = 99;
      expect(wire.writable).toBe(true);
      socket.bufferedAmount = 100;
      expect(wire.writable).toBe(false);
      socket.bufferedAmount = 0;
      wire.close();
      expect(wire.writable).toBe(false);
    });

    test('a full WebSocket is polled until it drains to half the mark', () => {
      const socket = new FakeSocket();
      const wire = new WebSocketWire(socket, { highWaterMark: 100 });
      let drained = 0;
      wire.onDrain = () => {
        drained += 1;
      };
      const timers = vi.getTimerCount();
      socket.bufferedAmount = 100;
      wire.send(new Uint8Array([1]));
      vi.advanceTimersByTime(5);
      expect(drained).toBe(0);
      socket.bufferedAmount = 51;
      vi.advanceTimersByTime(5);
      expect(drained).toBe(0);
      socket.bufferedAmount = 50;
      vi.advanceTimersByTime(5);
      expect(drained).toBe(1);
      expect(vi.getTimerCount()).toBe(timers);
    });

    test('a send while writable starts no poll', () => {
      const socket = new FakeSocket();
      const wire = new WebSocketWire(socket, { highWaterMark: 100 });
      const timers = vi.getTimerCount();
      wire.send(new Uint8Array([1]));
      expect(vi.getTimerCount()).toBe(timers);
    });

    test('closing stops the heartbeat and the poll', () => {
      const socket = new FakeSocket();
      const wire = new WebSocketWire(socket, { highWaterMark: 100 });
      socket.bufferedAmount = 100;
      wire.send(new Uint8Array([1]));
      wire.close();
      expect(vi.getTimerCount()).toBe(0);
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

    test('a small call is not starved by a large one in flight', async () => {
      const { front, daemon } = await pair();
      serveEcho(daemon);
      const finished: string[] = [];

      const big = front.open('svc/Echo');
      void big.send(new Uint8Array(4 * 1024 * 1024).fill(1));
      big.close();
      const bigDone = collect(big.responses).then(([echoed]) => {
        finished.push('big');
        expect(echoed).toHaveLength(4 * 1024 * 1024);
      });

      const small = front.open('svc/Echo');
      void small.send(encode('hi'));
      small.close();
      const smallDone = collect(small.responses).then((echoed) => {
        finished.push('small');
        expect(echoed).toEqual(['hi']);
      });

      await Promise.all([bigDone, smallDone]);
      expect(finished).toEqual(['small', 'big']);
    });
  });
});
