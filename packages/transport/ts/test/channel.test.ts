import { create, fromBinary, type MessageInitShape, toBinary } from '@bufbuild/protobuf';
import { describe, expect, test } from 'vitest';
import { Channel, Code, MAX_FRAGMENT_BYTES, MAX_MESSAGE_BYTES, TransportError } from '../src';
import {
  type Envelope,
  EnvelopeSchema,
  type RequestEnvelopeSchema,
  type ResponseEnvelopeSchema,
} from '../src/gen/elsewise/transport/v1/envelope_pb';
import { type MemoryWire, wirePair } from './wire/memory';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function collect(messages: AsyncIterable<Uint8Array>): Promise<string[]> {
  const received: string[] = [];
  for await (const message of messages) received.push(decode(message));
  return received;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function requestFrame(streamId: bigint, body: MessageInitShape<typeof RequestEnvelopeSchema>['body']): Uint8Array {
  return toBinary(EnvelopeSchema, create(EnvelopeSchema, { kind: { case: 'request', value: { streamId, body } } }));
}

function responseFrame(streamId: bigint, body: MessageInitShape<typeof ResponseEnvelopeSchema>['body']): Uint8Array {
  return toBinary(EnvelopeSchema, create(EnvelopeSchema, { kind: { case: 'response', value: { streamId, body } } }));
}

function record(wire: MemoryWire): Envelope[] {
  const sent: Envelope[] = [];
  const send = wire.send.bind(wire);
  wire.send = (frame) => {
    sent.push(fromBinary(EnvelopeSchema, frame));
    send(frame);
  };
  return sent;
}

function pair(): { front: Channel; daemon: Channel } {
  const [a, b] = wirePair();
  return { front: new Channel(a), daemon: new Channel(b, { parity: 'even' }) };
}

function serveEcho(channel: Channel, method = 'svc/Echo'): void {
  channel.handle(method, async (stream) => {
    for await (const message of stream.requests) stream.send(message);
  });
}

describe('channel', () => {
  test('a call round-trips', async () => {
    const { front, daemon } = pair();
    serveEcho(daemon);
    const stream = front.open('svc/Echo');
    stream.send(encode('one'));
    stream.send(encode('two'));
    stream.close();
    expect(await collect(stream.responses)).toEqual(['one', 'two']);
  });

  test('an empty message round-trips', async () => {
    const { front, daemon } = pair();
    serveEcho(daemon);
    const stream = front.open('svc/Echo');
    stream.send(new Uint8Array());
    stream.close();
    expect(await collect(stream.responses)).toEqual(['']);
  });

  test('concurrent streams interleave on one wire', async () => {
    const { front, daemon } = pair();
    serveEcho(daemon);

    const first = front.open('svc/Echo');
    const second = front.open('svc/Echo');
    first.send(encode('a1'));
    second.send(encode('b1'));
    first.send(encode('a2'));
    second.send(encode('b2'));
    second.close();
    first.close();

    const [firstReceived, secondReceived] = await Promise.all([collect(first.responses), collect(second.responses)]);
    expect(firstReceived).toEqual(['a1', 'a2']);
    expect(secondReceived).toEqual(['b1', 'b2']);
  });

  test('each peer open streams', async () => {
    const [a, b] = wirePair();
    const sentByFront = record(a);
    const sentByDaemon = record(b);
    const front = new Channel(a);
    const daemon = new Channel(b, { parity: 'even' });
    serveEcho(front);
    serveEcho(daemon);

    const fromFront = front.open('svc/Echo');
    fromFront.send(encode('to daemon'));
    fromFront.close();
    const fromDaemon = daemon.open('svc/Echo');
    fromDaemon.send(encode('to front'));
    fromDaemon.close();
    expect(await collect(fromFront.responses)).toEqual(['to daemon']);
    expect(await collect(fromDaemon.responses)).toEqual(['to front']);

    for (const envelope of sentByFront) {
      if (envelope.kind.case === 'request') expect(envelope.kind.value.streamId % 2n).toBe(1n);
    }
    for (const envelope of sentByDaemon) {
      if (envelope.kind.case === 'request') expect(envelope.kind.value.streamId % 2n).toBe(0n);
    }
  });

  test('a message larger than the fragment cap travels as several fragments and reassembles', async () => {
    const [a, b] = wirePair();
    const sent = record(a);
    const front = new Channel(a);
    const daemon = new Channel(b, { parity: 'even' });
    serveEcho(daemon);

    const big = new Uint8Array(MAX_FRAGMENT_BYTES * 2 + 5);
    // Used a value (250) that isn't ^2 so that the values won't line up perfectly with MAX_FRAGMENT_BYTES.
    for (let i = 0; i < big.length; i++) big[i] = i % 250;
    const stream = front.open('svc/Echo');
    stream.send(big);
    stream.close();

    const received: Uint8Array[] = [];
    for await (const message of stream.responses) received.push(message);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(big);

    const payloads = sent.filter(
      (envelope) => envelope.kind.case === 'request' && envelope.kind.value.body.case === 'payload',
    );
    expect(payloads).toHaveLength(3);
  });

  test('a request exceeding the message cap ends the stream with CODE_RESOURCE_EXHAUSTED', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    const sent = record(a);
    const served = deferred();
    let failure: unknown;
    let aborted = false;
    front.handle('svc/Sink', async (stream) => {
      failure = await collect(stream.requests).catch((error) => error);
      aborted = stream.signal.aborted;
      served.resolve();
    });
    b.send(requestFrame(2n, { case: 'open', value: { method: 'svc/Sink' } }));
    b.send(requestFrame(2n, { case: 'payload', value: { data: new Uint8Array(MAX_MESSAGE_BYTES), last: false } }));
    b.send(requestFrame(2n, { case: 'payload', value: { data: new Uint8Array(1), last: false } }));
    await served.promise;

    expect(failure).toMatchObject({ code: Code.RESOURCE_EXHAUSTED });
    expect(aborted).toBe(true);
    expect(sent.map((envelope) => envelope.kind.value?.body)).toEqual([
      { case: 'end', value: expect.objectContaining({ code: Code.RESOURCE_EXHAUSTED }) },
    ]);
  });

  test('a response exceeding the message cap fails the call with CODE_RESOURCE_EXHAUSTED', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    const sent = record(a);
    const stream = front.open('svc/Big');
    const pending = collect(stream.responses);
    b.send(responseFrame(1n, { case: 'payload', value: { data: new Uint8Array(MAX_MESSAGE_BYTES), last: false } }));
    b.send(responseFrame(1n, { case: 'payload', value: { data: new Uint8Array(1), last: false } }));

    await expect(pending).rejects.toMatchObject({ code: Code.RESOURCE_EXHAUSTED });
    expect(sent.map((envelope) => envelope.kind.value?.body?.case)).toEqual(['open', 'cancel']);
  });

  test('an unknown method ends the stream with CODE_UNIMPLEMENTED', async () => {
    const { front } = pair();
    const stream = front.open('svc/Nope');
    stream.close();
    await expect(collect(stream.responses)).rejects.toMatchObject({
      code: Code.UNIMPLEMENTED,
    });
  });

  test('a handler throwing a TransportError surfaces its code and message', async () => {
    const { front, daemon } = pair();
    daemon.handle('svc/Fail', async () => {
      throw new TransportError(Code.NOT_FOUND, 'no such thing');
    });
    const stream = front.open('svc/Fail');
    stream.close();
    await expect(collect(stream.responses)).rejects.toMatchObject({
      code: Code.NOT_FOUND,
      message: 'no such thing',
    });
  });

  test('a handler throwing a plain error surfaces CODE_UNKNOWN', async () => {
    const { front, daemon } = pair();
    daemon.handle('svc/Fail', async () => {
      throw new Error('boom');
    });
    const stream = front.open('svc/Fail');
    stream.close();
    await expect(collect(stream.responses)).rejects.toMatchObject({
      code: Code.UNKNOWN,
      message: 'boom',
    });
  });

  test('half-close ends the responder requests iteration without ending the call', async () => {
    const { front, daemon } = pair();
    daemon.handle('svc/Count', async (stream) => {
      let count = 0;
      for await (const _message of stream.requests) count += 1;
      stream.send(encode(String(count)));
    });
    const stream = front.open('svc/Count');
    stream.send(encode('a'));
    stream.send(encode('b'));
    stream.send(encode('c'));
    stream.close();
    expect(await collect(stream.responses)).toEqual(['3']);
  });

  test('cancel rejects the requester and aborts the responder', async () => {
    const { front, daemon } = pair();
    const aborted = deferred();
    daemon.handle('svc/Spray', async (stream) => {
      stream.signal.addEventListener('abort', aborted.resolve);
      await tick(); // Forces cancel to run before new messages are sent to mimic a race.
      for await (const message of stream.requests) {
        stream.send(message);
        stream.send(message);
      }
    });
    const stream = front.open('svc/Spray');
    stream.send(encode('x'));
    stream.cancel();
    await expect(collect(stream.responses)).rejects.toMatchObject({
      code: Code.CANCELLED,
    });
    await aborted.promise; // Ensures the stream.signal was called.

    // The channel survived the racing frames and a fresh call still works.
    serveEcho(daemon);
    const again = front.open('svc/Echo');
    again.send(encode('still alive'));
    again.close();
    expect(await collect(again.responses)).toEqual(['still alive']);
  });

  test('abandoning a response iteration cancels the call', async () => {
    const { front, daemon } = pair();
    const aborted = deferred();
    daemon.handle('svc/Ticks', async (stream) => {
      stream.signal.addEventListener('abort', aborted.resolve);
      let count = 0;
      while (!stream.signal.aborted) {
        stream.send(encode(String(count)));
        count += 1;
        await tick();
      }
    });
    const stream = front.open('svc/Ticks');
    stream.close();
    const received: string[] = [];
    for await (const message of stream.responses) {
      received.push(decode(message));
      if (received.length === 3) break;
    }
    expect(received).toEqual(['0', '1', '2']);
    await aborted.promise;
  });

  test('send after the responder ended is dropped and send after close throws', async () => {
    const { front, daemon } = pair();
    daemon.handle('svc/Eager', async () => {});
    const stream = front.open('svc/Eager');
    await expect(collect(stream.responses)).resolves.toEqual([]);
    // The responder already ended the call and a racing send must not throw.
    expect(() => stream.send(encode('late'))).not.toThrow();
    stream.close();
    expect(() => stream.send(encode('after close'))).toThrow('half-closed');
  });

  test('closing the channel fails local calls with CODE_CANCELLED and aborts the peer handlers', async () => {
    const { front, daemon } = pair();
    const aborted = deferred();
    daemon.handle('svc/Hang', (stream) => {
      stream.signal.addEventListener('abort', aborted.resolve);
      return new Promise(() => {});
    });
    const stream = front.open('svc/Hang');
    const pending = collect(stream.responses);
    await tick(); // Let the open frame reach the daemon before tearing the channel down.
    front.close();
    await expect(pending).rejects.toMatchObject({ code: Code.CANCELLED });
    await aborted.promise;
    expect(() => front.open('svc/Hang')).toThrow(TransportError);
  });

  test('the wire dying fails pending calls with CODE_UNAVAILABLE', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    const stream = front.open('svc/Echo'); // Sent to void as b doesn't have a Channel.
    const pending = collect(stream.responses);
    b.close();
    await expect(pending).rejects.toMatchObject({ code: Code.UNAVAILABLE });
    expect(() => front.open('svc/Echo')).toThrow(TransportError);
  });

  test('cancel discards responses already buffered but unread', async () => {
    const { front, daemon } = pair();
    const sent = deferred();
    daemon.handle('svc/Two', async (stream) => {
      stream.send(encode('one'));
      stream.send(encode('two'));
      sent.resolve();
      for await (const _message of stream.requests) {
        // Hold the stream open so nothing but the cancel ends it.
      }
    });
    const stream = front.open('svc/Two');
    await sent.promise;
    await tick();
    stream.cancel();
    const received: string[] = [];
    const read = async () => {
      for await (const message of stream.responses) received.push(decode(message));
    };
    await expect(read()).rejects.toMatchObject({ code: Code.CANCELLED });
    expect(received).toEqual([]);
  });

  test('a frame delivered after the channel closed does not invoke a handler', async () => {
    const { front, daemon } = pair();
    let called = false;
    front.handle('svc/Late', async () => {
      called = true;
    });
    daemon.open('svc/Late'); // The open frame is still in flight, until tick().
    front.close();
    await tick();
    expect(called).toBe(false);
  });

  test('frames carrying unrecognized oneof members are ignored and the channel stays alive', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    const daemon = new Channel(b, { parity: 'even' });
    serveEcho(daemon);
    const stream = front.open('svc/Echo');

    // An Envelope a newer peer could send with field 200 (unknown).
    b.send(Uint8Array.from([0xc2, 0x0c, 0x00]));

    // A ResponseEnvelope's body a newer peer could send with field 200 (unknown).
    b.send(Uint8Array.from([0x12, 0x05, 0x08, 0x01, 0xc2, 0x0c, 0x00]));

    // A RequestEnvelope's body a newer peer could send with field 200 (unknown).
    a.send(Uint8Array.from([0x0a, 0x05, 0x08, 0x01, 0xc2, 0x0c, 0x00]));

    stream.send(encode('still alive'));
    stream.close();
    expect(await collect(stream.responses)).toEqual(['still alive']);
  });

  test('an undecodable frame tears the channel down as a protocol violation', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    const stream = front.open('svc/Echo');
    const pending = collect(stream.responses);
    b.send(Uint8Array.from([0x0a, 0xff])); // Envelope is unable to decode with invalid protobuf bytes.
    await expect(pending).rejects.toMatchObject({ code: Code.INTERNAL });
  });

  test('a reused stream id tears the channel down as a protocol violation', async () => {
    const [a, b] = wirePair();
    const front = new Channel(a);
    serveEcho(front);
    const stream = front.open('svc/Echo');
    const pending = collect(stream.responses);
    const open = requestFrame(2n, { case: 'open', value: { method: 'svc/Echo' } });
    b.send(open);
    b.send(open);
    await expect(pending).rejects.toMatchObject({ code: Code.INTERNAL });
  });
});
