import { create, toBinary } from '@bufbuild/protobuf';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DataChannelWire } from '../../src';
import { EnvelopeSchema } from '../../src/gen/elsewise/transport/v1/envelope_pb';
import { FakeDataChannel } from './fake-socket';

function heartbeat(body: 'ping' | 'pong'): Uint8Array {
  return toBinary(
    EnvelopeSchema,
    create(EnvelopeSchema, { kind: { case: 'heartbeat', value: { body: { case: body, value: {} } } } }),
  );
}

const PING = heartbeat('ping');
const PONG = heartbeat('pong');

describe('data channel wire', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('never probes', () => {
    const channel = new FakeDataChannel();
    new DataChannelWire(channel);
    vi.advanceTimersByTime(60_000);
    expect(channel.sent).toEqual([]);
  });

  test('still answers a ping and ignores pong', () => {
    const channel = new FakeDataChannel();
    const wire = new DataChannelWire(channel);
    const frames: Uint8Array[] = [];
    wire.onFrame = (frame) => frames.push(frame);
    channel.deliver(PING);
    channel.deliver(PONG);
    channel.deliver(new Uint8Array([1, 2, 3]));
    expect(channel.sent).toEqual([PONG]);
    expect(frames.map((frame) => Array.from(frame))).toEqual([[1, 2, 3]]);
  });

  test('sets the threshold to half the mark and reports the drain through bufferedamountlow', () => {
    const channel = new FakeDataChannel();
    const wire = new DataChannelWire(channel, { highWaterMark: 100 });
    expect(channel.bufferedAmountLowThreshold).toBe(50);
    let drained = 0;
    wire.onDrain = () => {
      drained += 1;
    };
    channel.bufferedAmount = 100;
    wire.send(new Uint8Array([1]));
    expect(wire.writable).toBe(false);
    channel.bufferedAmount = 0;
    vi.advanceTimersByTime(50);
    expect(drained).toBe(0); // Not polled.
    channel.emit('bufferedamountlow');
    expect(drained).toBe(1);
  });

  test('a drain after closing is not reported', () => {
    const channel = new FakeDataChannel();
    const wire = new DataChannelWire(channel);
    let drained = 0;
    wire.onDrain = () => {
      drained += 1;
    };
    wire.close();
    channel.emit('bufferedamountlow');
    expect(drained).toBe(0);
  });

  test('opens once the channel is open', async () => {
    const channel = new FakeDataChannel();
    channel.readyState = 'open' as never;
    await expect(DataChannelWire.open(channel)).resolves.toBeInstanceOf(DataChannelWire);
  });
});
