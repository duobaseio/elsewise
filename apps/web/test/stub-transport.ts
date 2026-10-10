import type { LanguageServerTransport } from '@elsewise/plugin';

export interface StubTransport extends LanguageServerTransport {
  /** The messages sent to the server, in order. */
  readonly sent: { id?: number; method?: string; params?: unknown }[];
  /** The methods of the messages sent to the server, in order. */
  readonly methods: string[];
  /** Whether the connection was closed from this side. */
  closed: boolean;
  /** Closes the connection as a server that crashed would. */
  crash(): void;
  /** Sends a notification from the server. */
  notify(method: string, params: unknown): void;
}

// Returns a transport to a server with `capabilities` that answers each request in `answers` with what its answer
// returns, or resolves to, and ignores every other message. Each answer takes the params of its method, and one that
// rejects is answered with the server's error.
export function stubTransport(
  capabilities: object = {},
  answers: Record<string, (params: never) => unknown> = {},
): StubTransport {
  const messageListeners = new Set<(message: string) => void>();
  const closeListeners = new Set<() => void>();
  const reply = (id: number, answer: { result: unknown } | { error: { code: number; message: string } }) => {
    for (const listener of messageListeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', id, ...answer }));
    }
  };
  const stub: StubTransport = {
    sent: [],
    get methods() {
      return stub.sent.flatMap(({ method }) => method ?? []);
    },
    closed: false,
    send(message) {
      const { id, method, params } = JSON.parse(message);
      stub.sent.push({ id, method, params });
      const answer = method === 'initialize' ? () => ({ capabilities }) : answers[method];
      if (answer === undefined) {
        return;
      }
      const result = answer(params as never);
      if (result instanceof Promise) {
        result.then(
          (value) => reply(id, { result: value }),
          (error: Error) => reply(id, { error: { code: -32603, message: error.message } }),
        );
      } else {
        reply(id, { result });
      }
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close() {
      stub.closed = true;
      stub.crash();
    },
    crash() {
      for (const listener of closeListeners) {
        listener();
      }
    },
    notify(method, params) {
      for (const listener of messageListeners) {
        listener(JSON.stringify({ jsonrpc: '2.0', method, params }));
      }
    },
  };
  return stub;
}
