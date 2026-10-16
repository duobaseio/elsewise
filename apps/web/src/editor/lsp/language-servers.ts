import { LSPClient, type LSPPlugin } from '@codemirror/lsp-client';
import { type Extension, Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import type { Disposable, LanguageServer, LanguageServerTransport } from '@elsewise/plugin';
import DOMPurify from 'dompurify';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  type ApplyWorkspaceEditParams,
  type Command,
  ErrorCodes,
  type ExecuteCommandParams,
  MessageType,
  type ShowMessageParams,
} from 'vscode-languageserver-protocol';
import type { EditorManager } from '@/editor/editor-manager';
import { serverActions } from '@/editor/lsp/actions';
import { serverCompletion } from '@/editor/lsp/completion';
import { pullAllDiagnostics, serverDiagnostics } from '@/editor/lsp/diagnostics';
import { applyWorkspaceEdit, serverEdits } from '@/editor/lsp/edits';
import { serverHighlights } from '@/editor/lsp/highlights';
import { serverHover } from '@/editor/lsp/hover';
import { serverReferences } from '@/editor/lsp/references';
import { serverRename } from '@/editor/lsp/rename';
import { serverSignatureHelp } from '@/editor/lsp/signature-help';

/**
 * The known and running language servers.
 */
export class LanguageServers {
  private readonly instances = new Map<LanguageServer, Map<string, LanguageServerInstance>>();
  private readonly unsubscribe: Disposable;

  constructor(private readonly editor: EditorManager) {
    this.unsubscribe = editor.subscribe(() => {
      for (const [server, roots] of this.instances) {
        if (!editor.languageServers.includes(server)) {
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
    return this.editor.languageServers.find((server) => Object.hasOwn(server.languages, language));
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
    return this.editor.subscribe(listener);
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
 * The responses to the server's requests that lsp-client would refuse, by method.
 */
const REQUESTS = new Map([
  ['workspace/applyEdit', (client: LSPClient, { edit }: ApplyWorkspaceEditParams) => applyWorkspaceEdit(client, edit)],
]);

const commandHandlers = Facet.define<
  NonNullable<LanguageServer['commandHandlers']>,
  NonNullable<LanguageServer['commandHandlers']>
>({ combine: (values) => values[0] ?? {} });

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
        // First, so the plugin's notification handlers and editor extensions, which lsp-client tries in order, take
        // precedence over Elsewise's, while its client capabilities, which lsp-client merges in order, give way to
        // them.
        ...(server.extensions ?? []),
        serverCompletion(server),
        serverHover(),
        serverSignatureHelp(),
        serverRename(),
        serverReferences(),
        serverHighlights(),
        serverActions(),
        serverDiagnostics(),
        serverEdits(),
        {
          editorExtension: commandHandlers.of(server.commandHandlers ?? {}),
          notificationHandlers: {
            // Shows the server's messages in toasts rather than lsp-client's bar, and drops its logs as lsp-client
            // does.
            'window/showMessage': (_, { type, message }: ShowMessageParams) => {
              const kind = MESSAGE_TYPES.get(type);
              if (kind !== undefined) {
                toast.add({ type: kind, title: server.name, description: message });
              }
              return true;
            },
          },
        },
      ],
      sanitizeHTML: (html) => DOMPurify.sanitize(html),
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

      // The plugin's handlers take precedence over Elsewise's.
      const requests = new Map<string, (client: LSPClient, params: never) => unknown>([
        ...REQUESTS,
        ...Object.entries(this.server.requestHandlers ?? {}),
      ]);
      const handlers = new Map<(message: string) => void, Disposable>();
      this.client.connect({
        send: (message) => transport.send(message),
        subscribe: (handler) => {
          handlers.set(
            handler,
            transport.onMessage((message) => {
              const { id, method, params } = JSON.parse(message);
              const response = id !== undefined && requests.get(method);
              if (response) {
                void (async () => {
                  let reply: object;
                  try {
                    reply = { result: (await response(this.client, params as never)) ?? null };
                  } catch (error) {
                    reply = { error: { code: ErrorCodes.InternalError, message: (error as Error).message } };
                  }

                  if (this.transport === transport) {
                    transport.send(JSON.stringify({ jsonrpc: '2.0', id, ...reply }));
                  }
                })();
              } else {
                handler(message);
              }
            }),
          );
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

export async function run(view: EditorView, plugin: LSPPlugin, { command, arguments: args }: Command): Promise<void> {
  // Some implementations have non-compliant client commands.
  const handlers = view.state.facet(commandHandlers);
  if (Object.hasOwn(handlers, command)) {
    await handlers[command](plugin.client, view, (args ?? []) as never[]);
    return;
  }

  plugin.client.sync();
  await plugin.client.request<ExecuteCommandParams, unknown>('workspace/executeCommand', { command, arguments: args });
}

export const LanguageServersContext = createContext<LanguageServers | null>(null);

/**
 * Returns the CodeMirror extension that connects the document at `path` to the language server for `language` in the
 * worktree at `root`.
 *
 * `language` is CodeMirror's name for the language, e.g. `TypeScript`.
 */
export function useLanguageServerExtension(
  root: URL | undefined,
  language: string | undefined,
  path: string,
): Extension {
  const servers = useLanguageServers();
  const subscribe = useCallback((listener: () => void) => servers.subscribe(listener), [servers]);
  const server = useSyncExternalStore(subscribe, () => (language === undefined ? undefined : servers.find(language)));

  // Uses href rather than root since a caller's new URL for the same root would otherwise reconnect the document.
  const href = root?.href;
  return useMemo(() => {
    if (href === undefined || language === undefined || server === undefined) {
      return [];
    }

    return servers.connect(new URL(href), language, new URL(path, href)) ?? [];
  }, [servers, server, href, language, path]);
}

/**
 * Returns the language servers.
 */
export function useLanguageServers(): LanguageServers {
  const servers = useContext(LanguageServersContext);
  if (servers === null) {
    throw new Error('Missing LanguageServersContext');
  }

  return servers;
}
