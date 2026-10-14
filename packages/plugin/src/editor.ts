import type { LanguageDescription } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Disposable } from './plugin.ts';

/**
 * The code editor.
 */
export interface Editor {
  /**
   * The open editor that is or was last focused.
   *
   * `null` when:
   * * no editor has focused yet.
   * * the active editor is closed and focus has not shifted to another open editor.
   *
   * The active editor remains the same when focus is elsewhere (except on another editor), e.g. in a menu.
   */
  readonly active: EditorView | null;

  /**
   * Adds `extensions` to the editor, each an extension or a function that returns one for each document.
   *
   * Returns a disposable that removes the `extensions`.
   */
  addExtensions(extensions: readonly (Extension | ((document: EditorDocument) => Extension))[]): Disposable;

  /**
   * Adds `languages`, which take precedence over the built-in languages for the same files.
   *
   * Returns a disposable that removes the `languages`.
   */
  addLanguages(languages: readonly LanguageDescription[]): Disposable;

  /**
   * Adds language servers, which take precedence over the servers added earlier for the same languages.
   *
   * Returns a disposable that removes the `servers`.
   */
  addLanguageServers(servers: readonly LanguageServer[]): Disposable;
}

/**
 * A document open in the editor.
 */
export interface EditorDocument {
  /**
   * The document's path.
   */
  readonly path: string;
}

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
