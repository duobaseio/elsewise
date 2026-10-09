import type { LanguageDescription } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Disposable } from './plugin.ts';

/**
 * The ids of the built-in groups and items in the editor's context menu.
 */
export const DEFAULT_EDITOR_CONTEXT_MENU = {
  clipboard: {
    id: '10-clipboard',
    items: { cut: '10-cut', copy: '20-copy', paste: '30-paste' },
  },
  navigate: {
    id: '13-navigate',
    items: { usages: '10-usages', definition: '20-definition' },
  },
  refactor: {
    id: '16-refactor',
    items: { rename: '10-rename' },
  },
} as const;

/**
 * The code editor.
 */
export interface Editor {
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

  /**
   * Adds groups of context menu items to the editor's context menu.
   *
   * Groups, and the items in each group, are sorted by id. See {@link DEFAULT_EDITOR_CONTEXT_MENU} for the built-in
   * groups and items. Submenus with the same id in a group are merged.
   *
   * To add a group after the built-in groups:
   * ```ts
   * editor.addContextMenuItems({
   *   '20-generate': [{ type: 'item', id: '10-generate', label: 'Generate…', command: generate }],
   * });
   * ```
   *
   * To add an item to the built-in clipboard group, after its `30-paste` item:
   * ```ts
   * editor.addContextMenuItems({
   *   [DEFAULT_EDITOR_CONTEXT_MENU.clipboard.id]: [
   *     { type: 'item', id: '35-paste-plain', label: 'Paste plain', command: pastePlain },
   *   ],
   * });
   * ```
   *
   * To add an item to a submenu that another plugin added, repeat the submenu with its id:
   * ```ts
   * editor.addContextMenuItems({
   *   '30-refactor': [
   *     {
   *       type: 'submenu',
   *       id: '10-refactor',
   *       label: 'Refactor',
   *       items: { '10-code': [{ type: 'item', id: '20-inline', label: 'Inline', command: inline }] },
   *     },
   *   ],
   * });
   * ```
   *
   * Returns a disposable that removes the `items`.
   */
  addContextMenuItems(items: EditorContextMenu): Disposable;
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

/**
 * Items and submenus in the editor's context menu, keyed by the id of the group that they are shown in.
 */
export type EditorContextMenu = Readonly<Record<string, readonly (EditorContextMenuItem | EditorContextSubmenu)[]>>;

/**
 * An item in the editor's context menu.
 */
export interface EditorContextMenuItem {
  /**
   * The entry's type.
   */
  readonly type: 'item';

  /**
   * The item's id.
   *
   * The items in a group are sorted by id. See {@link DEFAULT_EDITOR_CONTEXT_MENU} for the built-in items.
   *
   * To add an item after the built-in `30-paste` item:
   * ```ts
   * { type: 'item', id: '35-paste-plain', label: 'Paste plain', command: pastePlain }
   * ```
   */
  readonly id: string;

  /**
   * The item's label.
   */
  readonly label: string;

  /**
   * The item's shortcut in CodeMirror's notation, e.g. `Mod-Shift-k`.
   *
   * It is only displayed, not bound.
   */
  readonly shortcut?: string;

  /**
   * Called when the user clicks the item.
   */
  command(view: EditorView): void;

  /**
   * Returns whether the item is shown.
   *
   * Without it, the item is always shown.
   */
  shown?(view: EditorView): boolean;
}

/**
 * A submenu in the editor's context menu.
 *
 * It is not shown when none of its items are.
 */
export interface EditorContextSubmenu {
  /**
   * The entry's type.
   */
  readonly type: 'submenu';

  /**
   * The submenu's id.
   *
   * Submenus with the same id in a group are merged.
   */
  readonly id: string;

  /**
   * The submenu's label.
   */
  readonly label: string;

  /**
   * The submenu's items, keyed by the id of the group that they are shown in.
   *
   * Groups, and the items in each group, are sorted by id.
   */
  readonly items: EditorContextMenu;
}
