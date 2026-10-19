import type { LSPClient, LSPClientExtension } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { CompletionItem, CompletionParams } from 'vscode-languageserver-protocol';
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
   * The settings sent to the server after initialization and in response to `workspace/configuration`.
   *
   * For `pyright`:
   * ```ts
   * { python: { analysis: { typeCheckingMode: 'strict' } } }
   * ```
   *
   * The default implementation treats the `section` in `workspace/configuration` as a dot-separated identifier, and
   * sends the entire settings in response to an empty section.
   *
   * For example, the server is sent `{ indentWidth: 2 }` for `cpp.formatterOptions`:
   * ```ts
   * { cpp: { formatterOptions: { indentWidth: 2 } } }
   * ```
   *
   * Furthermore, the default implementation ignores `scopeUri`s.
   *
   * To handle `workspace/configuration`s, add a handler to {@link requestHandlers}. For example, to send
   * `typescript-language-server` the indentation of the file at `scopeUri`:
   * ```ts
   * {
   *   'workspace/configuration': (client, { items }: ConfigurationParams) =>
   *     items.map(({ section, scopeUri }) => {
   *       const view = scopeUri && client.workspace.getFile(scopeUri)?.getView();
   *       return section === 'formattingOptions' && view ? { tabSize: getIndentUnit(view.state), ... } : null;
   *     }),
   * }
   * ```
   */
  readonly settings?: Readonly<Record<string, unknown>>;

  /**
   * The LSP client extensions.
   *
   * Their **notification** handlers run before Elsewise's, and their CodeMirror extensions take precedence over
   * Elsewise's. When both set the same client capability, Elsewise's wins.
   */
  readonly extensions?: readonly (Extension | LSPClientExtension)[];

  /**
   * The handlers for requests that the server sends to the editor, which take precedence over Elsewise's.
   *
   * A handler returns the result, or a promise of it. A thrown error or rejection is sent to the server as an error.
   *
   * For example, to rename a constant right after `typescript-language-server` extracts it:
   * ```ts
   * {
   *   '_typescript.rename': (client, { textDocument, position }: TextDocumentPositionParams) => {
   *     const view = client.workspace.getFile(textDocument.uri)?.getView();
   *     ...
   *     commands.run(DEFAULT_COMMANDS.editor.lsp.rename, view);
   *     return null;
   *   },
   * }
   * ```
   */
  readonly requestHandlers?: Readonly<Record<string, (client: LSPClient, params: never) => unknown>>;

  /**
   * The handlers for commands that the server expects the editor to run, which take precedence over sending them to the
   * server with `workspace/executeCommand`.
   *
   * A handler is called with the editor the command is run from and the command's arguments.
   *
   * For example, to open parameter info for a completion that {@link completionItems} gave this command:
   * ```ts
   * {
   *   'editor.action.triggerParameterHints': (client, view) =>
   *     commands.run(DEFAULT_COMMANDS.editor.lsp.showSignatureHelp, view),
   * }
   * ```
   */
  readonly commandHandlers?: Readonly<Record<string, (client: LSPClient, view: EditorView, args: never[]) => unknown>>;

  /**
   * Starts the server for the worktree at `root` and returns a transport to it.
   */
  start(root: URL): LanguageServerTransport | Promise<LanguageServerTransport>;

  /**
   * Modifies and returns the completion items to be shown.
   */
  completionItems?(
    client: LSPClient,
    items: CompletionItem[],
    params: CompletionParams,
  ): CompletionItem[] | Promise<CompletionItem[]>;
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
