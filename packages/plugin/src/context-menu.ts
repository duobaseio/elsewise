/**
 * The editor context menu's built-in groups, submenus and items.
 */
export const DEFAULT_EDITOR_CONTEXT_MENU = {
  actions: { id: 'io.duobase.elsewise.editor.contextMenu.actions', order: 5, items: { show: 10 } },
  clipboard: {
    id: 'io.duobase.elsewise.editor.contextMenu.clipboard',
    order: 10,
    items: { cut: 10, copy: 20, paste: 30 },
  },
  navigate: {
    id: 'io.duobase.elsewise.editor.contextMenu.navigate',
    order: 20,
    items: { usages: 10, definition: 20 },
  },
  diff: {
    id: 'io.duobase.elsewise.editor.contextMenu.diff',
    order: 30,
    items: {
      compare: {
        id: 'io.duobase.elsewise.editor.contextMenu.diff.compare',
        order: 10,
        groups: {
          changes: {
            id: 'io.duobase.elsewise.editor.contextMenu.diff.compare.changes',
            order: 10,
            items: { unstaged: 10, uncommitted: 20, branch: 30 },
          },
          none: { id: 'io.duobase.elsewise.editor.contextMenu.diff.compare.none', order: 20, items: { none: 10 } },
        },
      },
    },
  },
  refactor: { id: 'io.duobase.elsewise.editor.contextMenu.refactor', order: 40, items: { rename: 10 } },
} as const;

/**
 * A group of items, separated from other groups in a context menu.
 *
 * Groups with the same id in a scope, e.g. the editor, are merged. `order`, `in` and items with duplicate ids all use
 * the first defined values.
 *
 * ```ts
 * editor.addContextMenu([
 *   // Items in a built-in group
 *   { id: DEFAULT_EDITOR_CONTEXT_MENU.refactor.id, items: [{ order: 20, command: 'example.excuse' }] },
 *
 *   // After the built-in groups.
 *   { id: 'example.reactions', order: 50, items: [{ order: 10, command: 'example.shrug' }] },
 *
 *   // Submenu trigger
 *   { id: 'example.tone', order: 60, items: [{ label: 'Tone of voice', submenu: 'example.tone' }] },
 *   // Submenu content
 *   { id: 'example.tones', in: 'example.tone', items: [{ order: 10, command: 'example.uwu' }] },
 * ]);
 * ```
 */
export interface ContextMenuGroup {
  /**
   * The id of this group, e.g. `DEFAULT_EDITOR_CONTEXT_MENU.refactor.id`.
   *
   * Groups with the same id in the same scope, e.g. the editor, are merged.
   *
   * See {@link DEFAULT_EDITOR_CONTEXT_MENU} for the built-in groups.
   */
  readonly id: string;

  /**
   * The order of this group in its menu, shown lowest first and by id when equal. Groups without one are shown last.
   *
   * A differing order added later is ignored.
   */
  readonly order?: number;

  /**
   * The id of the submenu this group is in, or none for the menu itself.
   *
   * A differing submenu added later is ignored.
   *
   * See {@link ContextMenuSubmenuItem} for opening a submenu.
   */
  readonly in?: string;

  /**
   * The items in this group. An item whose command or submenu already exists in the group is ignored.
   */
  readonly items: readonly (ContextMenuItem | ContextMenuSubmenuItem)[];
}

/**
 * An item that runs a command.
 */
export interface ContextMenuItem {
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The label shown instead of the command's, where the menu gives it context, e.g. `None` in `Compare with…`.
   */
  readonly label?: string;

  /**
   * The id of the command it runs, e.g. `DEFAULT_COMMANDS.editor.lsp.rename`. Ignored if the id is invalid or missing.
   *
   * See {@link DEFAULT_COMMANDS} for the built-in commands.
   */
  readonly command: string;
}

/**
 * An item that opens a submenu: the groups whose `in` is its id. It is hidden when none of them has an item to show.
 */
export interface ContextMenuSubmenuItem {
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The label shown.
   *
   * It is possible for there to be multiple submenu items with different labels in different groups.
   */
  readonly label: string;

  /**
   * The id of the submenu it opens, e.g. `DEFAULT_EDITOR_CONTEXT_MENU.diff.items.compare.id`.
   *
   * See {@link ContextMenuGroup.in} for adding a group to it.
   */
  readonly submenu: string;
}
