import {
  create,
  type DescMessage,
  type DescMethodBiDiStreaming,
  type DescMethodClientStreaming,
  type DescMethodServerStreaming,
  type DescMethodUnary,
  type DescService,
  fromBinary,
  type MessageInitShape,
  type MessageShape,
  toBinary,
} from '@bufbuild/protobuf';
import type { Channel, RequesterStream } from './channel';
import { TransportError } from './error';
import { Code } from './gen/elsewise/transport/v1/envelope_pb';

export interface CallOptions {
  /** Aborting the signal cancels the call. */
  signal?: AbortSignal;
}

/** A bidirectional-streaming call. */
export interface BidiCall<In, Out> {
  /** Sends one request message and resolves once it has been handed to the wire. */
  send(request: In): Promise<void>;

  /** Half-closes the call: promises the responder no further messages. */
  close(): void;

  /** Abandons the call. */
  cancel(): void;

  /** The response messages: ends on CODE_OK, throws a TransportError on any other outcome. */
  responses: AsyncIterable<Out>;
}

/** A service's calls, shaped by each rpc's streaming type. */
export type Client<S extends DescService> = {
  [M in keyof S['method']]: ClientMethod<S['method'][M]>;
};

type ClientMethod<M> =
  M extends DescMethodUnary<infer I, infer O>
    ? (request: MessageInitShape<I>, options?: CallOptions) => Promise<MessageShape<O>>
    : M extends DescMethodServerStreaming<infer I, infer O>
      ? (request: MessageInitShape<I>, options?: CallOptions) => AsyncIterable<MessageShape<O>>
      : M extends DescMethodClientStreaming<infer I, infer O>
        ? (
            requests: AsyncIterable<MessageInitShape<I>> | Iterable<MessageInitShape<I>>,
            options?: CallOptions,
          ) => Promise<MessageShape<O>>
        : M extends DescMethodBiDiStreaming<infer I, infer O>
          ? (options?: CallOptions) => BidiCall<MessageInitShape<I>, MessageShape<O>>
          : never;

/** Builds the typed client for one service, carrying its calls over the channel. */
export function createClient<S extends DescService>(channel: Channel, service: S): Client<S> {
  const client: Record<string, unknown> = {};
  for (const method of service.methods) {
    const name = `${service.typeName}/${method.name}`;
    switch (method.methodKind) {
      case 'unary': {
        const unary = method as DescMethodUnary;
        client[method.localName] = (request: MessageInitShape<DescMessage>, options?: CallOptions) =>
          unaryCall(channel, name, unary, request, options);
        break;
      }
      case 'server_streaming': {
        const serverStream = method as DescMethodServerStreaming;
        client[method.localName] = (request: MessageInitShape<DescMessage>, options?: CallOptions) =>
          serverStreamCall(channel, name, serverStream, request, options);
        break;
      }
      case 'client_streaming': {
        const clientStream = method as DescMethodClientStreaming;
        client[method.localName] = (
          requests: AsyncIterable<MessageInitShape<DescMessage>> | Iterable<MessageInitShape<DescMessage>>,
          options?: CallOptions,
        ) => clientStreamCall(channel, name, clientStream, requests, options);
        break;
      }
      case 'bidi_streaming': {
        const bidi = method as DescMethodBiDiStreaming;
        client[method.localName] = (options?: CallOptions) => bidiCall(channel, name, bidi, options);
        break;
      }
    }
  }
  return client as Client<S>;
}

async function unaryCall<I extends DescMessage, O extends DescMessage>(
  channel: Channel,
  name: string,
  method: DescMethodUnary<I, O>,
  request: MessageInitShape<I>,
  options?: CallOptions,
): Promise<MessageShape<O>> {
  const stream = channel.open(name);
  cancelOnAbort(stream, options?.signal);
  void stream.send(toBinary(method.input, create(method.input, request)));
  stream.close();
  return singleResponse(stream, name, method.output);
}

function serverStreamCall<I extends DescMessage, O extends DescMessage>(
  channel: Channel,
  name: string,
  method: DescMethodServerStreaming<I, O>,
  request: MessageInitShape<I>,
  options?: CallOptions,
): AsyncIterable<MessageShape<O>> {
  const stream = channel.open(name);
  cancelOnAbort(stream, options?.signal);
  void stream.send(toBinary(method.input, create(method.input, request)));
  stream.close();
  return decodeResponses(stream, method.output);
}

/** Distinguishes stream death from an iterator result. */
const FINISHED = Symbol('finished');

async function clientStreamCall<I extends DescMessage, O extends DescMessage>(
  channel: Channel,
  name: string,
  method: DescMethodClientStreaming<I, O>,
  requests: AsyncIterable<MessageInitShape<I>> | Iterable<MessageInitShape<I>>,
  options?: CallOptions,
): Promise<MessageShape<O>> {
  const stream = channel.open(name);
  cancelOnAbort(stream, options?.signal);
  // Observe the response before pumping: an early End (a responder error) must stop the stream.
  const response = singleResponse(stream, name, method.output);
  const iterator = Symbol.asyncIterator in requests ? requests[Symbol.asyncIterator]() : requests[Symbol.iterator]();
  const finished: Promise<typeof FINISHED> = stream.finished.then(() => FINISHED);

  try {
    while (true) {
      const next = await Promise.race([Promise.resolve(iterator.next()), finished]);
      if (next === FINISHED) {
        try {
          void Promise.resolve(iterator.return?.()).catch(() => {});
        } catch {
          // The iterator return() threw. Nothing much we can do about it.
        }
        break;
      }

      if (next.done) {
        stream.close();
        break;
      }
      // Awaited so the impl's iterable applies backpressure. The promise is resolved when the message is sent through
      // the wire.
      await stream.send(toBinary(method.input, create(method.input, next.value)));
    }
  } catch (error) {
    // The caller's iterable threw mid-stream.
    void response.catch(() => {});
    stream.cancel();
    throw error;
  }

  return response;
}

function bidiCall<I extends DescMessage, O extends DescMessage>(
  channel: Channel,
  name: string,
  method: DescMethodBiDiStreaming<I, O>,
  options?: CallOptions,
): BidiCall<MessageInitShape<I>, MessageShape<O>> {
  const stream = channel.open(name);
  cancelOnAbort(stream, options?.signal);
  return {
    send: (request) => stream.send(toBinary(method.input, create(method.input, request))),
    close: () => stream.close(),
    cancel: () => stream.cancel(),
    responses: decodeResponses(stream, method.output),
  };
}

function cancelOnAbort(stream: RequesterStream, signal: AbortSignal | undefined): void {
  if (!signal) {
    return;
  }
  if (signal.aborted) {
    stream.cancel();
    return;
  }
  const cancel = () => stream.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  void stream.finished.then(() => signal.removeEventListener('abort', cancel));
}

async function* decodeResponses<O extends DescMessage>(
  stream: RequesterStream,
  output: O,
): AsyncGenerator<MessageShape<O>> {
  for await (const bytes of stream.responses) {
    yield fromBinary(output, bytes);
  }
}

async function singleResponse<O extends DescMessage>(
  stream: RequesterStream,
  name: string,
  output: O,
): Promise<MessageShape<O>> {
  let response: MessageShape<O> | undefined;
  for await (const bytes of stream.responses) {
    if (response !== undefined) {
      throw new TransportError(Code.INTERNAL, `${name} answered with more than one message`);
    }
    response = fromBinary(output, bytes);
  }
  if (response === undefined) {
    throw new TransportError(Code.INTERNAL, `${name} ended without a response message`);
  }
  return response;
}
