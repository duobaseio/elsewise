import type { LanguageServerTransport } from '@elsewise/plugin';

type Response = { result?: unknown; error?: { code: number; message: string } };

/**
 * A transport to a server with `capabilities` that responds to each request in `handlers` with what its handler
 * returns, or resolves to, and ignores every other message. Each handler takes the params of its method, and one that
 * rejects sends the server's error.
 */
export class StubTransport implements LanguageServerTransport {
  /** The messages sent to the server, in order. */
  readonly sent: { id?: number; method?: string; params?: unknown }[] = [];
  /** Whether the connection was closed from this side. */
  closed = false;

  readonly #capabilities: object;
  readonly #handlers: Record<string, (params: never) => unknown>;
  readonly #messageListeners = new Set<(message: string) => void>();
  readonly #closeListeners = new Set<() => void>();
  // The server's requests that the client hasn't responded to, by id.
  readonly #requests = new Map<number, (response: Response) => void>();
  #lastId = 0;

  constructor(capabilities: object = {}, handlers: Record<string, (params: never) => unknown> = {}) {
    this.#capabilities = capabilities;
    this.#handlers = handlers;
  }

  send(message: string): void {
    const parsed = JSON.parse(message);
    const { id, method, params } = parsed;
    if (method === undefined) {
      this.#requests.get(id)?.({ result: parsed.result, error: parsed.error });
      this.#requests.delete(id);
      return;
    }
    this.sent.push({ id, method, params });
    const handler = method === 'initialize' ? () => ({ capabilities: this.#capabilities }) : this.#handlers[method];
    if (handler === undefined) {
      return;
    }
    const result = handler(params as never);
    if (result instanceof Promise) {
      result.then(
        (value) => this.#reply(id, { result: value }),
        (error: Error) => this.#reply(id, { error: { code: -32603, message: error.message } }),
      );
    } else {
      this.#reply(id, { result });
    }
  }

  #reply(id: number, response: { result: unknown } | { error: { code: number; message: string } }): void {
    for (const listener of this.#messageListeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', id, ...response }));
    }
  }

  notify(method: string, params: unknown): void {
    for (const listener of this.#messageListeners) {
      listener(JSON.stringify({ jsonrpc: '2.0', method, params }));
    }
  }

  /** Sends a request from the server, and resolves with the client's response. */
  request(method: string, params: unknown): Promise<Response> {
    const id = ++this.#lastId;
    return new Promise((resolve) => {
      this.#requests.set(id, resolve);
      for (const listener of this.#messageListeners) {
        listener(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      }
    });
  }

  onMessage(listener: (message: string) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.crash();
  }

  /** Closes the connection as a server that crashed would. */
  crash(): void {
    for (const listener of this.#closeListeners) {
      listener();
    }
  }

  onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  get methods(): string[] {
    return this.sent.flatMap(({ method }) => method ?? []);
  }
}
