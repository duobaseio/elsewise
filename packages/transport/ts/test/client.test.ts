import { describe, expect, test, vi } from 'vitest';
import { Channel, Code, createClient, type ServiceImpl, serve, TransportError } from '../src';
import { TestService } from './gen/test_service_pb';
import { wirePair } from './wire/memory';

function pair(): { front: Channel; daemon: Channel } {
  const [a, b] = wirePair();
  return { front: new Channel(a), daemon: new Channel(b, { parity: 'even' }) };
}

async function take<T>(iterator: AsyncIterator<T>): Promise<T> {
  const result = await iterator.next();
  if (result.done) throw new Error('iterator ended early');
  return result.value;
}

const IMPL: ServiceImpl<typeof TestService> = {
  unary: (request) => ({ text: request.text }),
  serverStream: async function* (request) {
    yield { text: request.text, seq: 1 };
    yield { text: request.text, seq: 2 };
  },
  clientStream: async (requests) => {
    let text = '';
    for await (const request of requests) text += request.text;
    return { text };
  },
  bidiStream: async function* (requests) {
    let seq = 0;
    for await (const request of requests) yield { text: request.text, seq: ++seq };
  },
};

describe('client', () => {
  describe('unary', () => {
    test('a call resolves', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const first = await client.unary({ text: 'hello' });
      expect(first.text).toBe('hello');
      const second = await client.unary({ text: 'again' });
      expect(second.text).toBe('again');
    });

    test('a call rejects with the TransportError when implementation throws', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        unary: (request) => {
          throw new TransportError(Code.NOT_FOUND, `no text ${request.text}`);
        },
      });
      const client = createClient(front, TestService);
      await expect(client.unary({ text: 'p9' })).rejects.toMatchObject({
        code: Code.NOT_FOUND,
        message: 'no text p9',
      });
    });

    test('a responder answering with two messages rejects with CODE_INTERNAL', async () => {
      const { front, daemon } = pair();
      daemon.handle(`${TestService.typeName}/Unary`, async (stream) => {
        stream.send(new Uint8Array());
        stream.send(new Uint8Array());
      });
      const client = createClient(front, TestService);
      await expect(client.unary({})).rejects.toMatchObject({
        code: Code.INTERNAL,
        message: expect.stringContaining('more than one message'),
      });
    });

    test('a responder ending without a message rejects with CODE_INTERNAL', async () => {
      const { front, daemon } = pair();
      daemon.handle(`${TestService.typeName}/Unary`, async () => {});
      const client = createClient(front, TestService);
      await expect(client.unary({})).rejects.toMatchObject({
        code: Code.INTERNAL,
        message: expect.stringContaining('without a response message'),
      });
    });

    test('an abort signal cancels an in-flight call', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        unary: () => new Promise(() => {}),
      });
      const client = createClient(front, TestService);
      const controller = new AbortController();
      const pending = client.unary({}, { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: Code.CANCELLED });
    });

    test('a completed call detaches from its signal, leaving the controller reusable', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const controller = new AbortController();
      const removed = vi.spyOn(controller.signal, 'removeEventListener');
      await client.unary({ text: 'still here' }, { signal: controller.signal });
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));

      const answered = await client.unary({ text: 'after abort' });
      expect(answered.text).toBe('after abort');
    });
  });

  describe('server streaming', () => {
    test('a call yields each response', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const responses = [];
      for await (const response of client.serverStream({ text: 'chunk' }))
        responses.push(`${response.text} ${response.seq}`);
      expect(responses).toEqual(['chunk 1', 'chunk 2']);
    });

    test('an abort signal cancels an in-flight call', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        serverStream: async function* () {
          await new Promise(() => {});
        },
      });
      const client = createClient(front, TestService);
      const controller = new AbortController();
      const responses = client.serverStream({}, { signal: controller.signal })[Symbol.asyncIterator]();
      const pending = responses.next();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: Code.CANCELLED });
    });
  });

  describe('client streaming', () => {
    test('a call sends every request and resolves', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const response = await client.clientStream([{ text: 'hello' }, { text: ' ' }, { text: 'world' }]);
      expect(response.text).toBe('hello world');
    });

    test('a call stops pumping once the responder fails early', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        clientStream: () => {
          throw new TransportError(Code.INVALID_ARGUMENT, 'no writes today');
        },
      });
      const client = createClient(front, TestService);
      let pulled = 0;
      let released = false;

      async function* chunks() {
        try {
          while (true) {
            pulled += 1;
            yield { text: 'chunk' };
          }
        } finally {
          released = true;
        }
      }

      await expect(client.clientStream(chunks())).rejects.toMatchObject({
        code: Code.INVALID_ARGUMENT,
      });
      expect(released).toBe(true);
      expect(pulled).toBeLessThan(20);
    });

    test('an abort signal unsticks a call awaiting its own iterable', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const controller = new AbortController();
      const stuck = {
        [Symbol.asyncIterator]: () => ({
          next: () => new Promise<never>(() => {}),
        }),
      };
      const pending = client.clientStream(stuck, { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: Code.CANCELLED });
    });
  });

  describe('bidi streaming', () => {
    test('a call flows both ways until the requester closes', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const call = client.bidiStream();
      const responses = call.responses[Symbol.asyncIterator]();

      call.send({ text: 'a.ts' });
      const first = await take(responses);
      expect(first.text).toBe('a.ts');
      expect(first.seq).toBe(1);

      call.send({ text: 'b.ts' });
      const second = await take(responses);
      expect(second.text).toBe('b.ts');
      expect(second.seq).toBe(2);

      call.close();
      expect((await responses.next()).done).toBe(true);
    });

    test('the responses reject with the TransportError when the implementation throws', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        bidiStream: async function* (requests) {
          for await (const request of requests) {
            yield { text: request.text, seq: 1 };
            throw new TransportError(Code.UNAVAILABLE, 'that is enough');
          }
        },
      });
      const client = createClient(front, TestService);
      const call = client.bidiStream();
      const responses = call.responses[Symbol.asyncIterator]();

      call.send({ text: 'one' });
      const first = await take(responses);
      expect(first.text).toBe('one');

      await expect(responses.next()).rejects.toMatchObject({
        code: Code.UNAVAILABLE,
        message: 'that is enough',
      });
    });

    test('the responses end when the responder finishes first', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, {
        ...IMPL,
        bidiStream: async function* () {
          yield { text: 'only', seq: 1 };
        },
      });
      const client = createClient(front, TestService);
      const call = client.bidiStream();
      const responses = call.responses[Symbol.asyncIterator]();
      const first = await take(responses);
      expect(first.text).toBe('only');
      expect((await responses.next()).done).toBe(true);
    });

    test('cancelling a call rejects its responses', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const call = client.bidiStream();
      const responses = call.responses[Symbol.asyncIterator]();

      call.send({ text: 'here' });
      await take(responses);

      call.cancel();
      await expect(responses.next()).rejects.toMatchObject({ code: Code.CANCELLED });
    });

    test('an abort signal cancels an in-flight call', async () => {
      const { front, daemon } = pair();
      serve(daemon, TestService, IMPL);
      const client = createClient(front, TestService);
      const controller = new AbortController();
      const call = client.bidiStream({ signal: controller.signal });
      const responses = call.responses[Symbol.asyncIterator]();

      call.send({ text: 'still open' });
      const first = await take(responses);
      expect(first.seq).toBe(1);

      controller.abort();
      await expect(responses.next()).rejects.toMatchObject({ code: Code.CANCELLED });
    });
  });
});
