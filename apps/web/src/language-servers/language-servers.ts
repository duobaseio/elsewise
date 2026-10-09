import { LSPClient, serverDiagnostics } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { toast } from '@elsewise/components/components/toast';
import type { Disposable, LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import DOMPurify from 'dompurify';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { MessageType, type ShowMessageParams } from 'vscode-languageserver-protocol';
import { serverCompletion } from '@/language-servers/completion';
import { serverDefinition } from '@/language-servers/definition';
import { pullAllDiagnostics, pullDiagnostics } from '@/language-servers/diagnostics';
import { serverFormatting } from '@/language-servers/formatting';
import { serverHighlights } from '@/language-servers/highlights';
import { serverHover } from '@/language-servers/hover';
import { serverReferences } from '@/language-servers/references';
import { serverRename } from '@/language-servers/rename';
import { serverSignatureHelp } from '@/language-servers/signature-help';
import { EditorAdditions } from '@/plugins/editor';

/**
 * The known and running language servers.
 */
export class LanguageServers {
  private readonly instances = new Map<LanguageServer, Map<string, LanguageServerInstance>>();
  private readonly unsubscribe: Disposable;

  constructor(private readonly additions: EditorAdditions) {
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
  find(language: string): LanguageServer | undefined {
    return this.additions.languageServers.find((server) => Object.hasOwn(server.languages, language));
  }

  /**
   * Returns the extension that connects the document at `uri` to the server for `language` in the worktree at `root`.
   *
   * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
   */
  connect(root: URL, language: string, uri: URL): Extension | undefined {
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

    return instance.client.plugin(serverUri(uri), server.languages[language]);
  }

  /**
   * Registers a `listener` that is called when what plugins have added changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  subscribe(listener: () => void): Disposable {
    return this.additions.subscribe(listener);
  }

  /**
   * Stops every server.
   */
  dispose(): void {
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
 * The toast type for each type of message a server shows.
 */
const MESSAGE_TYPES = new Map([
  [MessageType.Error, 'error'],
  [MessageType.Warning, 'warning'],
  [MessageType.Info, 'info'],
]);

/**
 * A language server instance.
 */
export class LanguageServerInstance {
  /**
   * The server's client, which stays the same when the server is restarted.
   */
  readonly client: LSPClient;
  private transport: LanguageServerTransport | undefined;
  private starting = false;
  private stopped = false;

  /**
   * Creates `server` at `root`, without starting it.
   */
  constructor(
    private readonly server: LanguageServer,
    private readonly root: URL,
  ) {
    this.client = new LSPClient({
      rootUri: serverUri(root),
      initializationOptions: server.initializationOptions,
      extensions: [
        serverCompletion(),
        serverHover(),
        serverSignatureHelp(),
        serverRename(),
        serverReferences(),
        serverHighlights(),
        serverDefinition(),
        serverFormatting(),
        serverDiagnostics(),
        pullDiagnostics(),
      ],
      sanitizeHTML: (html) => DOMPurify.sanitize(html),
      notificationHandlers: {
        // Shows the server's messages in toasts rather than lsp-client's bar, and drops its logs as lsp-client does.
        'window/showMessage': (_, { type, message }: ShowMessageParams) => {
          const kind = MESSAGE_TYPES.get(type);
          if (kind !== undefined) {
            toast.add({ type: kind, title: server.name, description: message });
          }
          return true;
        },
      },
    });
  }

  /**
   * Starts the server, unless it is running, already starting or was stopped.
   */
  async start(): Promise<void> {
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
        if (!this.stopped) {
          toast.add({ type: 'warning', title: `${this.server.name} stopped` });
        }
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
      this.client.initializing.then(
        () => pullAllDiagnostics(this.client),
        (error) => {
          console.error(`Language server ${this.server.name} failed to initialize`, error);
          toast.add({
            type: 'error',
            title: `${this.server.name} failed to initialize`,
            description: (error as Error).message,
          });
        },
      );
    } catch (error) {
      console.error(`Language server ${this.server.name} failed to start`, error);
      toast.add({ type: 'error', title: `${this.server.name} failed to start`, description: (error as Error).message });
    } finally {
      this.starting = false;
    }
  }

  /**
   * Stops the server.
   */
  stop(): void {
    this.stopped = true;
    this.transport?.close();
    this.transport = undefined;
    this.client.disconnect();
  }
}

/**
 * Returns the `file:` URL `url` as language servers write it, so the URIs they send back match the ones they were sent.
 *
 * Follows `vscode-uri`, which most servers write URIs with: every character but letters, digits, `-._~` and `/` is
 * percent-encoded, and a Windows drive letter is lowercased. TypeScript's server, for one, writes `$` as `%24`.
 */
export function serverUri(url: URL): string {
  const path = decodeURIComponent(url.pathname)
    .replace(/^\/([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}:`)
    .replace(/[^A-Za-z0-9\-._~/]/gu, (character) =>
      encodeURIComponent(character).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`),
    );
  return `${url.protocol}//${url.host}${path}`;
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
