import { fromBinary } from '@bufbuild/protobuf';
import { describe, expect, test } from 'vitest';
import { Channel, Code, createClient, MAX_FRAGMENT_BYTES, type ServiceImpl, serve } from '../src';
import { type Envelope, EnvelopeSchema } from '../src/gen/elsewise/transport/v1/envelope_pb';
import { TestService } from './gen/test_service_pb';
import { MemoryWire, wirePair } from './wire/memory';

function pair(): { front: Channel; daemon: Channel } {
  const [a, b] = wirePair();
  return { front: new Channel(a), daemon: new Channel(b, { parity: 'even' }) };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Enough tick() to resolve all tasks broken up into separate microtask queues.
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await tick();
}

async function take<T>(iterator: AsyncIterator<T>): Promise<T> {
  const result = await iterator.next();
  if (result.done) throw new Error('iterator ended early');
  return result.value;
}

const STUB: ServiceImpl<typeof TestService> = {
  unary: () => ({ text: '' }),
  serverStream: async function* () {},
  clientStream: async () => ({ text: '' }),
  bidiStream: async function* () {},
};

describe('serve', () => {
  test('cancelling a server-streaming call closes the impl generator', async () => {
    const { front, daemon } = pair();
    let cleaned = false;
    serve(daemon, TestService, {
      ...STUB,
      serverStream: async function* () {
        try {
          while (true) {
            yield { text: 'chunk' };
            await tick(); // Prevents spamming the microtask queue.
          }
        } finally {
          cleaned = true;
        }
      },
    });
    const client = createClient(front, TestService);
    const responses = client.serverStream({})[Symbol.asyncIterator]();
    await take(responses);

    await responses.return?.(); // Abandoning the iteration cancels the call.
    await settle(); // Requires settle() as tick() above breaks the tasks into multiple different microtask queues.
    expect(cleaned).toBe(true);
  });

  test('cancelling a bidi call closes an impl that never reads requests', async () => {
    const { front, daemon } = pair();
    let cleaned = false;
    serve(daemon, TestService, {
      ...STUB,
      bidiStream: async function* () {
        try {
          while (true) {
            yield { text: 'event' };
            await tick();
          }
        } finally {
          cleaned = true;
        }
      },
    });

    const client = createClient(front, TestService);
    const call = client.bidiStream();
    await take(call.responses[Symbol.asyncIterator]());
    call.cancel();
    await settle();
    expect(cleaned).toBe(true);
  });

  test('a finite server-streaming impl delivers everything and ends OK', async () => {
    const { front, daemon } = pair();
    let finished = false;
    serve(daemon, TestService, {
      ...STUB,
      serverStream: async function* () {
        try {
          yield { text: 'one' };
          yield { text: 'two' };
        } finally {
          finished = true;
        }
      },
    });
    const client = createClient(front, TestService);
    const texts: string[] = [];
    for await (const response of client.serverStream({})) texts.push(response.text);
    expect(texts).toEqual(['one', 'two']);
    expect(finished).toBe(true);
  });

  test('channel death mid-stream closes the impl generator', async () => {
    const { front, daemon } = pair();
    let cleaned = false;
    serve(daemon, TestService, {
      ...STUB,
      serverStream: async function* () {
        try {
          while (true) {
            yield { text: 'chunk' };
            await tick(); // Prevents spamming the microtask queue.
          }
        } finally {
          cleaned = true;
        }
      },
    });
    const client = createClient(front, TestService);
    const responses = client.serverStream({})[Symbol.asyncIterator]();
    await take(responses);
    front.close();
    await settle(); // Requires settle() as tick() above breaks the tasks into multiple different microtask queues.
    expect(cleaned).toBe(true);
  });

  test('a call closing without its request message ends with CODE_INVALID_ARGUMENT', async () => {
    const { front, daemon } = pair();
    serve(daemon, TestService, STUB);
    const stream = front.open(`${TestService.typeName}/ServerStream`);
    stream.close();
    const read = async () => {
      for await (const _message of stream.responses) {
        // singleRequest must fail before any response arrives.
      }
    };
    await expect(read()).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
  });

  test.each(['Unary', 'ClientStream'])(
    'cancelling a %s call drops its response still waiting on a full wire',
    async (method) => {
      const a = new MemoryWire();
      const b = new MemoryWire(1);
      a.peer = b;
      b.peer = a;
      const serverSent: Envelope[] = [];
      const send = b.send.bind(b);
      b.send = (frame) => {
        serverSent.push(fromBinary(EnvelopeSchema, frame));
        send(frame);
      };
      const front = new Channel(a);
      const daemon = new Channel(b, { parity: 'even' });
      const text = 'x'.repeat(MAX_FRAGMENT_BYTES * 4); // Several fragments, so most of it waits behind the full wire.
      serve(daemon, TestService, { ...STUB, unary: () => ({ text }), clientStream: async () => ({ text }) });

      const stream = front.open(`${TestService.typeName}/${method}`);
      void stream.send(new Uint8Array(0));
      stream.close();
      await settle();
      expect(serverSent.map((envelope) => envelope.kind.value?.body.case)).toEqual(['payload']);

      stream.cancel();
      await settle();
      for (let i = 0; i < 8; i++) b.drain();
      expect(serverSent.map((envelope) => envelope.kind.value?.body.case)).toEqual(['payload', 'end']);
      expect(serverSent[1]?.kind.value?.body.value).toMatchObject({ code: Code.CANCELLED });
    },
  );
});
