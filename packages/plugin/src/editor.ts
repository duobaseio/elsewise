import type { LanguageDescription } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Disposable } from './plugin.ts';

/**
 * The ids of the built-in groups and items in the editor's context menu.
 */
export const DEFAULT_EDITOR_CONTEXT_MENU = {
  clipboard: {
    id: '10-clipboard',
    items: { cut: '10-cut', copy: '20-copy', paste: '30-paste', selectAll: '40-select-all' },
  },
  code: {
    id: '20-code',
    items: { toggleComment: '10-toggle-comment', fold: '20-fold', unfold: '30-unfold' },
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
   * Adds groups of context menu items to the editor's context menu.
   *
   * Groups, and the items in each group, are sorted by id. See {@link DEFAULT_EDITOR_CONTEXT_MENU} for the built-in
   * groups and items. Submenus with the same id in a group are merged.
   *
   * To add a group between the built-in `10-clipboard` and `20-code` groups:
   * ```ts
   * editor.addContextMenuItems({
   *   '15-format': [{ type: 'item', id: '10-format', label: 'Format', command: format }],
   * });
   * ```
   *
   * To add an item to the built-in clipboard group, between its `30-paste` and `40-select-all` items:
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
   * To add an item between the built-in `30-paste` and `40-select-all` items:
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
  shown?(state: EditorState): boolean;
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
