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
import type { Channel, ResponderStream } from './channel';
import { TransportError } from './error';
import { Code } from './gen/elsewise/transport/v1/envelope_pb';

export interface HandlerContext {
  /** Aborted when the requester cancels the call or the channel dies. */
  signal: AbortSignal;
}

/** A service's method implementation, shaped by each rpc's streaming type. */
export type ServiceImpl<S extends DescService> = {
  [M in keyof S['method']]: MethodImpl<S['method'][M]>;
};

type MethodImpl<M> =
  M extends DescMethodUnary<infer I, infer O>
    ? (request: MessageShape<I>, context: HandlerContext) => MessageInitShape<O> | Promise<MessageInitShape<O>>
    : M extends DescMethodServerStreaming<infer I, infer O>
      ? (request: MessageShape<I>, context: HandlerContext) => AsyncIterable<MessageInitShape<O>>
      : M extends DescMethodClientStreaming<infer I, infer O>
        ? (
            requests: AsyncIterable<MessageShape<I>>,
            context: HandlerContext,
          ) => MessageInitShape<O> | Promise<MessageInitShape<O>>
        : M extends DescMethodBiDiStreaming<infer I, infer O>
          ? (requests: AsyncIterable<MessageShape<I>>, context: HandlerContext) => AsyncIterable<MessageInitShape<O>>
          : never;

type AnyInit = MessageInitShape<DescMessage>;
type UnaryImpl = MethodImpl<DescMethodUnary>;
type ServerStreamImpl = MethodImpl<DescMethodServerStreaming>;
type ClientStreamImpl = MethodImpl<DescMethodClientStreaming>;
type BidiImpl = MethodImpl<DescMethodBiDiStreaming>;

/** Registers an implementation of every method of the service on the channel. */
export function serve<S extends DescService>(channel: Channel, service: S, impl: ServiceImpl<S>): void {
  const methods = impl as Record<string, unknown>;
  for (const method of service.methods) {
    const name = `${service.typeName}/${method.name}`;
    switch (method.methodKind) {
      case 'unary': {
        const fn = methods[method.localName] as UnaryImpl;
        channel.handle(name, async (stream) => {
          const request = await singleRequest(stream, method.input);
          const response = await fn(request, { signal: stream.signal });
          // Awaited to prevent premature deregistration. The end method is immediately called once serve is done.
          await stream.send(toBinary(method.output, create(method.output, response)));
        });
        break;
      }
      case 'server_streaming': {
        const fn = methods[method.localName] as ServerStreamImpl;
        channel.handle(name, async (stream) => {
          const request = await singleRequest(stream, method.input);
          await relayResponses(stream, fn(request, { signal: stream.signal }), method.output);
        });
        break;
      }
      case 'client_streaming': {
        const fn = methods[method.localName] as ClientStreamImpl;
        channel.handle(name, async (stream) => {
          const response = await fn(decodeRequests(stream, method.input), {
            signal: stream.signal,
          });
          // Awaited to prevent premature deregistration. The end method is immediately called once serve is done.
          await stream.send(toBinary(method.output, create(method.output, response)));
        });
        break;
      }
      case 'bidi_streaming': {
        const fn = methods[method.localName] as BidiImpl;
        channel.handle(name, (stream) =>
          relayResponses(
            stream,
            fn(decodeRequests(stream, method.input), {
              signal: stream.signal,
            }),
            method.output,
          ),
        );
        break;
      }
    }
  }
}

/** Distinguishes an abort signal from an iterator result. */
const ABORTED = Symbol('aborted');

/** Sends each of the impl's responses until the iterable ends or the stream dies. */
async function relayResponses(
  stream: ResponderStream,
  responses: AsyncIterable<AnyInit>,
  output: DescMessage,
): Promise<void> {
  const iterator = responses[Symbol.asyncIterator]();
  const { signal } = stream;
  if (signal.aborted) {
    closeImpl(iterator);
    return;
  }
  let onAbort!: () => void;
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    onAbort = () => resolve(ABORTED);
  });
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      const next = Promise.resolve(iterator.next());
      const result = await Promise.race([aborted, next]);
      if (result === ABORTED) {
        // Handles the edge case where the next result might result in an error.
        next.then(
          () => {},
          () => {},
        );
        closeImpl(iterator);
        return;
      }
      if (result.done) return;
      // Awaited so the impl's iterable applies backpressure. The promise is resolved when the message is sent through
      // the wire.
      await stream.send(toBinary(output, create(output, result.value)));
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function closeImpl(iterator: AsyncIterator<AnyInit>): void {
  try {
    void Promise.resolve(iterator.return?.()).catch(() => {});
  } catch {
    // The iterator return() threw. Nothing much we can do about it.
  }
}

async function* decodeRequests<I extends DescMessage>(
  stream: ResponderStream,
  input: I,
): AsyncGenerator<MessageShape<I>> {
  for await (const bytes of stream.requests) {
    yield fromBinary(input, bytes);
  }
}

async function singleRequest<I extends DescMessage>(stream: ResponderStream, input: I): Promise<MessageShape<I>> {
  for await (const bytes of stream.requests) {
    return fromBinary(input, bytes);
  }
  throw new TransportError(Code.INVALID_ARGUMENT, 'the call carried no request message');
}
