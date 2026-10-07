import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import type { Disposable, LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import DOMPurify from 'dompurify';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { EditorAdditions } from '@/plugins/editor';

/**
 * The known and running language servers.
 */
export class LanguageServers {
  private readonly instances = new Map<LanguageServer, Map<string, LanguageServerInstance>>();
  private readonly unsubscribe: Disposable;

  public constructor(private readonly additions: EditorAdditions) {
    this.unsubscribe = additions.subscribe(() => {
      for (const [server, roots] of this.instances) {
        if (!additions.languageServers.includes(server)) {
          for (const running of roots.values()) {
            running.stop();
          }
          this.instances.delete(server);
        }
      }
    });
  }

  /**
   * Returns the server for `language`, or `undefined` if no server serves it.
   *
   * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
   */
  public find(language: string): LanguageServer | undefined {
    return this.additions.languageServers.find((server) => Object.hasOwn(server.languages, language));
  }

  /**
   * Returns the extension that connects the document at `uri` to the server for `language` in the worktree at `root`.
   *
   * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
   */
  public connect(root: URL, language: string, uri: URL): Extension | undefined {
    const server = this.find(language);
    if (server === undefined) {
      return undefined;
    }

    let roots = this.instances.get(server);
    if (roots === undefined) {
      roots = new Map();
      this.instances.set(server, roots);
    }

    let instance = roots.get(root.href);
    if (instance === undefined) {
      instance = new LanguageServerInstance(server, root);
      roots.set(root.href, instance);
    }

    void instance.start();

    return instance.client.plugin(uri.href, server.languages[language]);
  }

  /**
   * Registers a `listener` that is called when what plugins have added changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  public subscribe(listener: () => void): Disposable {
    return this.additions.subscribe(listener);
  }

  /**
   * Stops every server.
   */
  public dispose(): void {
    this.unsubscribe();
    for (const roots of this.instances.values()) {
      for (const instance of roots.values()) {
        instance.stop();
      }
    }
    this.instances.clear();
  }
}

/**
 * A language server instance.
 */
export class LanguageServerInstance {
  /**
   * The server's client, which stays the same when the server is restarted.
   */
  public readonly client: LSPClient;
  private transport: LanguageServerTransport | undefined;
  private starting = false;
  private stopped = false;

  /**
   * Creates `server` at `root`, without starting it.
   */
  public constructor(
    private readonly server: LanguageServer,
    private readonly root: URL,
  ) {
    this.client = new LSPClient({
      rootUri: root.href,
      initializationOptions: server.initializationOptions,
      extensions: languageServerExtensions(), // TODO: We might need to rip this out.
      sanitizeHTML: (html) => DOMPurify.sanitize(html),
    });
  }

  /**
   * Starts the server, unless it is running, already starting or was stopped.
   */
  public async start(): Promise<void> {
    if (this.transport !== undefined || this.starting || this.stopped) {
      return;
    }

    this.starting = true;
    try {
      const transport = await this.server.start(this.root);
      if (this.stopped) {
        transport.close();
        return;
      }

      this.transport = transport;
      this.transport.onClose(() => {
        this.transport = undefined;
        this.client.disconnect();
      });

      const handlers = new Map<(message: string) => void, Disposable>();
      this.client.connect({
        send: (message) => transport.send(message),
        subscribe: (handler) => {
          handlers.set(handler, transport.onMessage(handler));
        },
        unsubscribe: (handler) => {
          handlers.get(handler)?.();
          handlers.delete(handler);
        },
      });
      this.client.initializing.catch((error) => {
        console.error(`Language server ${this.server.name} failed to initialize`, error);
      });
    } catch (error) {
      console.error(`Language server ${this.server.name} failed to start`, error);
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stops the server.
   */
  public stop(): void {
    this.stopped = true;
    this.transport?.close();
    this.transport = undefined;
    this.client.disconnect();
  }
}

/**
 * The language servers.
 *
 * Defaults to none.
 */
export const LanguageServersContext = createContext(new LanguageServers(new EditorAdditions()));

/**
 * Returns the language servers.
 */
export function useLanguageServers(): LanguageServers {
  return useContext(LanguageServersContext);
}

/**
 * Returns the server for `language`, or `undefined` if no server serves it.
 *
 * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
 */
export function useLanguageServer(language: string | undefined): LanguageServer | undefined {
  const servers = useLanguageServers();
  const subscribe = useCallback((listener: () => void) => servers.subscribe(listener), [servers]);
  return useSyncExternalStore(subscribe, () => (language === undefined ? undefined : servers.find(language)));
}
