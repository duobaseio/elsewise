import type { LSPClient, LSPClientExtension } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import type { Disposable } from '../plugin.ts';

/**
 * A language server.
 */
export interface LanguageServer {
  /**
   * The server's id, unique among the plugin's servers.
   */
  readonly id: string;

  /**
   * The server's display name.
   */
  readonly name: string;

  /**
   * The LSP language ids of the languages that the server serves, keyed by CodeMirror's name for the language.
   *
   * ```ts
   * { TypeScript: 'typescript', TSX: 'typescriptreact' }
   * ```
   */
  readonly languages: Readonly<Record<string, string>>;

  /**
   * The options sent to the server when it is initialized.
   *
   * For `typescript-language-server`:
   * ```ts
   * { preferences: { quotePreference: 'single' }, tsserver: { path: 'node_modules/typescript/lib' } }
   * ```
   */
  readonly initializationOptions?: unknown;

  /**
   * The LSP client extensions.
   *
   * Their **notification** handlers run before Elsewise's, and their CodeMirror extensions take precedence over
   * Elsewise's. When both set the same client capability, Elsewise's wins.
   */
  readonly extensions?: readonly (Extension | LSPClientExtension)[];

  /**
   * The handlers for server's requests which take precedence over Elsewise's.
   *
   * A handler returns the result, or a promise of it. A thrown error or rejection is sent to the server as an error.
   *
   * For example, to handle `typescript-language-server`'s non-LSP compliant message:
   * ```ts
   * { '_typescript.rename': (client, { textDocument, position }: RenameParams) => null }
   * ```
   */
  readonly requestHandlers?: Readonly<Record<string, (client: LSPClient, params: never) => unknown>>;

  /**
   * Starts the server for the worktree at `root` and returns a transport to it.
   */
  start(root: URL): LanguageServerTransport | Promise<LanguageServerTransport>;
}

/**
 * A connection to a language server.
 *
 * A message is one JSON-RPC message without LSP's headers.
 */
export interface LanguageServerTransport {
  /**
   * Sends `message` to the server.
   *
   * Throws an error if the connection is closed.
   */
  send(message: string): void;

  /**
   * Registers a `listener` that is called with each message from the server.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  onMessage(listener: (message: string) => void): Disposable;

  /**
   * Registers a `listener` that is called when the connection closes, e.g. when the server crashes or `close` is
   * called.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  onClose(listener: () => void): Disposable;

  /**
   * Closes the connection.
   */
  close(): void;
}
