import { create, fromBinary, type MessageInitShape, toBinary } from '@bufbuild/protobuf';
import { AsyncQueue } from './async-queue';
import { TransportError } from './error';
import {
  Code,
  type Envelope,
  EnvelopeSchema,
  type Fragment,
  type RequestEnvelope,
  type RequestEnvelopeSchema,
  type ResponseEnvelope,
  type ResponseEnvelopeSchema,
} from './gen/elsewise/transport/v1/envelope_pb';
import type { Wire } from './wire';

/**
 * The largest Fragment.data a channel sends. WebRTC data channels only reliably deliver messages up to 16 KiB
 * cross-browser, so every message is sliced to fit under that with headroom for the envelope framing around a slice.
 */
export const MAX_FRAGMENT_BYTES = 16 * 1024 - 64;

/** The largest message a channel reassembles. */
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export interface ChannelOptions {
  /** Which stream ids this side mints: the frontend mints odd ids and the daemon even ones. Defaults to odd. */
  parity?: 'odd' | 'even';
}

/** A requester's live call. */
export interface RequesterStream {
  /** Sends one request message. */
  send(message: Uint8Array): void;

  /** Half-closes the call: promises the responder no further messages. */
  close(): void;

  /** Abandons the call: reads of `responses` reject with CODE_CANCELLED. */
  cancel(): void;

  /**
   * The response messages: ends on CODE_OK, throws a TransportError on any other outcome. Abandoning the iteration
   * early cancels the call.
   */
  responses: AsyncIterable<Uint8Array>;

  /** Settles once the stream is finished: the responder ended it, this side cancelled, or the channel died. */
  finished: Promise<void>;
}

/** An incoming call. */
export interface ResponderStream {
  method: string;

  /** The request messages: ends when the requester half-closes, throws CODE_CANCELLED if it cancels. */
  requests: AsyncIterable<Uint8Array>;

  /** Sends one response message. */
  send(message: Uint8Array): void;

  /** Aborted when the requester cancels or the channel dies. */
  signal: AbortSignal;
}

/** Serves one incoming call: resolving ends it with CODE_OK, throwing with the thrown error's code. */
export type StreamHandler = (stream: ResponderStream) => Promise<void>;

type RequestBody = NonNullable<MessageInitShape<typeof RequestEnvelopeSchema>['body']>;
type ResponseBody = NonNullable<MessageInitShape<typeof ResponseEnvelopeSchema>['body']>;

/** Slices one message into fragments no larger than MAX_FRAGMENT_BYTES. */
function eachFragment(message: Uint8Array, emit: (data: Uint8Array, last: boolean) => void): void {
  let offset = 0;
  do {
    const end = Math.min(offset + MAX_FRAGMENT_BYTES, message.length);
    emit(message.subarray(offset, end), end === message.length);
    offset = end;
  } while (offset < message.length);
}

/** Reassembles one stream's consecutive fragments back into a whole message. */
class Reassembler {
  #parts: Uint8Array[] = [];
  #size = 0;

  add(fragment: Fragment): Uint8Array | null {
    if (this.#size + fragment.data.length > MAX_MESSAGE_BYTES)
      throw new TransportError(Code.RESOURCE_EXHAUSTED, 'message exceeds max message size.');
    this.#size += fragment.data.length;
    this.#parts.push(fragment.data);
    if (!fragment.last) return null;
    const parts = this.#parts;
    this.#parts = [];
    this.#size = 0;
    if (parts.length === 1) return parts[0];
    const whole = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      whole.set(part, offset);
      offset += part.length;
    }
    return whole;
  }
}

class Requester implements RequesterStream {
  readonly responses: AsyncIterable<Uint8Array>;
  readonly finished: Promise<void>;
  readonly #queue = new AsyncQueue<Uint8Array>();
  readonly #reassembler = new Reassembler();
  readonly #sendBody: (body: RequestBody) => void;
  readonly #onFinished: () => void;
  /** Set once nothing more travels on the stream: the responder ended it, this side cancelled, or the channel died. */
  #finished = false;
  #halfClosed = false;
  #settleFinished!: () => void;

  constructor(sendBody: (body: RequestBody) => void, onFinished: () => void) {
    this.#sendBody = sendBody;
    this.#onFinished = onFinished;
    this.responses = this.#responses();
    this.finished = new Promise((resolve) => {
      this.#settleFinished = resolve;
    });
  }

  send(message: Uint8Array): void {
    if (this.#halfClosed) throw new Error('send on a half-closed stream');
    if (this.#finished) return;
    eachFragment(message, (data, last) => this.#sendBody({ case: 'payload', value: { data, last } }));
  }

  close(): void {
    if (this.#halfClosed) return;
    this.#halfClosed = true;
    if (this.#finished) return;
    this.#sendBody({ case: 'close', value: {} });
  }

  cancel(): void {
    this.#abandon(new TransportError(Code.CANCELLED, 'cancelled by this requester'));
  }

  /** Called by the channel with each incoming fragment; delivers the response message the last one completes. */
  onPayload(fragment: Fragment): void {
    let message: Uint8Array | null;
    try {
      message = this.#reassembler.add(fragment);
    } catch (error) {
      this.#abandon(error as TransportError);
      return;
    }
    if (message !== null) this.#queue.push(message);
  }

  /** Called by the channel when the responder's End arrives or the channel dies. */
  finish(error?: TransportError): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#onFinished();
    if (error) this.#queue.fail(error);
    else this.#queue.end();
    this.#settleFinished();
  }

  /** Abandons the call with the given error. */
  #abandon(error: TransportError): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#onFinished();
    this.#sendBody({ case: 'cancel', value: {} });
    // abort, not fail: an abandoned call does not need to yield responses it already buffered.
    this.#queue.abort(error);
    this.#settleFinished();
  }

  async *#responses(): AsyncGenerator<Uint8Array> {
    try {
      yield* this.#queue;
    } finally {
      this.cancel();
    }
  }
}

class Responder implements ResponderStream {
  readonly method: string;
  // A facade rather than the queue itself, so a handler holds no reference to the queue's mutators.
  readonly requests: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: () => this.#requests[Symbol.asyncIterator](),
  };
  readonly #requests = new AsyncQueue<Uint8Array>();
  readonly #reassembler = new Reassembler();
  readonly #abort = new AbortController();
  readonly #sendBody: (body: ResponseBody) => void;
  readonly #onFinished: () => void;
  #finished = false; // Set once End is sent.

  constructor(method: string, sendBody: (body: ResponseBody) => void, onFinished: () => void) {
    this.method = method;
    this.#sendBody = sendBody;
    this.#onFinished = onFinished;
  }

  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  send(message: Uint8Array): void {
    if (this.#finished) return;
    eachFragment(message, (data, last) => this.#sendBody({ case: 'payload', value: { data, last } }));
  }

  /** Sends this side's End. */
  end(error?: TransportError): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#onFinished();
    this.#sendBody({
      case: 'end',
      value: error ? { code: error.code, message: error.message } : { code: Code.OK },
    });
  }

  /** Called by the channel with each incoming fragment; delivers the request message the last one completes. */
  onPayload(fragment: Fragment): void {
    let message: Uint8Array | null;
    try {
      message = this.#reassembler.add(fragment);
    } catch (error) {
      this.abort(error as TransportError);
      return;
    }
    if (message !== null) this.#requests.push(message);
  }

  /** Called by the channel when the requester half-closes: ends the request messages. */
  onClose(): void {
    this.#requests.end();
  }

  /** Ends the call and aborts. */
  abort(error: TransportError): void {
    this.end(error);
    this.#requests.fail(error);
    this.#abort.abort(error);
  }
}

/**
 * Multiplexes any number of concurrent calls over one Wire with the elsewise.transport.v1 envelope protocol.
 *
 * Either peer can open streams: open() makes this side the requester, handle() serves streams the peer opens. A
 * protocol violation from the peer — an undecodable frame, a reused stream id — tears the whole channel down, failing
 * every live call with CODE_INTERNAL. Frames carrying oneof members this build does not know are ignored: a newer
 * peer may legally send them.
 */
export class Channel {
  readonly #wire: Wire;
  readonly #requesters = new Map<bigint, Requester>();
  readonly #responders = new Map<bigint, Responder>();
  readonly #handlers = new Map<string, StreamHandler>();
  #nextStreamId: bigint;
  #closed: TransportError | undefined;

  constructor(wire: Wire, options?: ChannelOptions) {
    this.#wire = wire;
    this.#nextStreamId = options?.parity === 'even' ? 2n : 1n;
    wire.onFrame = (frame) => this.#onFrame(frame);
    wire.onClosed = (reason) => this.#teardown(new TransportError(Code.UNAVAILABLE, reason ?? 'connection closed'));
  }

  /**
   * Opens a stream carrying the named rpc (e.g. "elsewise.daemon.v1.FileService/ReadFile"); this side is the
   * requester.
   **/
  open(method: string): RequesterStream {
    if (this.#closed) throw this.#closed;
    const streamId = this.#nextStreamId;
    this.#nextStreamId += 2n;
    const stream = new Requester(
      (body) => this.#sendRequest(streamId, body),
      () => this.#requesters.delete(streamId),
    );
    this.#requesters.set(streamId, stream);
    this.#sendRequest(streamId, { case: 'open', value: { method } });
    return stream;
  }

  /** Registers the handler serving a fully qualified method name for streams the peer opens. */
  handle(method: string, handler: StreamHandler): void {
    this.#handlers.set(method, handler);
  }

  /** Closes the channel and its wire. */
  close(): void {
    this.#teardown(new TransportError(Code.CANCELLED, 'channel closed'));
  }

  #protocolError(detail: string): void {
    this.#teardown(new TransportError(Code.INTERNAL, `protocol violation: ${detail}`));
  }

  #teardown(requesterError: TransportError): void {
    if (this.#closed) return;
    this.#closed = requesterError; // Prevents further messages from being sent.
    for (const stream of this.#requesters.values()) stream.finish(requesterError);
    const cancelled = new TransportError(Code.CANCELLED, requesterError.message);
    for (const stream of this.#responders.values()) stream.abort(cancelled);
    this.#wire.close();
  }

  #sendRequest(streamId: bigint, body: RequestBody): void {
    if (this.#closed) return;
    this.#send({ kind: { case: 'request', value: { streamId, body } } });
  }

  #sendResponse(streamId: bigint, body: ResponseBody): void {
    if (this.#closed) return;
    this.#send({ kind: { case: 'response', value: { streamId, body } } });
  }

  #send(envelope: MessageInitShape<typeof EnvelopeSchema>): void {
    this.#wire.send(toBinary(EnvelopeSchema, create(EnvelopeSchema, envelope)));
  }

  #onFrame(frame: Uint8Array): void {
    if (this.#closed) return;
    let envelope: Envelope;
    try {
      envelope = fromBinary(EnvelopeSchema, frame);
    } catch {
      this.#protocolError('undecodable frame');
      return;
    }
    const kind = envelope.kind;
    switch (kind.case) {
      case 'request':
        this.#onRequestFrame(kind.value);
        break;
      case 'response':
        this.#onResponseFrame(kind.value);
        break;
      default:
        // A newer peer may legally send oneof members this build does not know; ignore the frame.
        break;
    }
  }

  #onRequestFrame(frame: RequestEnvelope): void {
    const body = frame.body;
    if (body.case === 'open') {
      this.#openResponder(frame.streamId, body.value.method);
      return;
    }

    const stream = this.#responders.get(frame.streamId);
    // Ignore frames if stream is missing.
    if (!stream) return;
    switch (body.case) {
      case 'payload':
        stream.onPayload(body.value);
        break;
      case 'close':
        stream.onClose();
        break;
      case 'cancel':
        stream.abort(new TransportError(Code.CANCELLED, 'cancelled by the requester'));
        break;
      default:
        // A newer peer may legally send oneof members this build does not know; ignore the frame.
        break;
    }
  }

  #onResponseFrame(frame: ResponseEnvelope): void {
    const stream = this.#requesters.get(frame.streamId);
    if (!stream) return;
    const body = frame.body;
    switch (body.case) {
      case 'payload':
        stream.onPayload(body.value);
        break;
      case 'end': {
        const { code, message } = body.value;
        stream.finish(code === Code.OK ? undefined : new TransportError(code, message));
        break;
      }
      default:
        // A newer peer may legally send oneof members this build does not know; ignore the frame.
        break;
    }
  }

  #openResponder(streamId: bigint, method: string): void {
    if (this.#responders.has(streamId)) {
      this.#protocolError(`reused stream id ${streamId}`);
      return;
    }

    const handler = this.#handlers.get(method);
    if (!handler) {
      this.#sendResponse(streamId, {
        case: 'end',
        value: {
          code: Code.UNIMPLEMENTED,
          message: `unimplemented method: ${method}`,
        },
      });
      return;
    }

    const stream = new Responder(
      method,
      (body) => this.#sendResponse(streamId, body),
      () => this.#responders.delete(streamId),
    );
    this.#responders.set(streamId, stream);
    void this.#serve(stream, handler);
  }

  async #serve(stream: Responder, handler: StreamHandler): Promise<void> {
    try {
      await handler(stream);
      stream.end();
    } catch (error) {
      if (error instanceof TransportError) stream.end(error);
      else stream.end(new TransportError(Code.UNKNOWN, error instanceof Error ? error.message : String(error)));
    }
  }
}
