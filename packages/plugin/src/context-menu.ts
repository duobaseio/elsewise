/**
 * The editor context menu's built-in groups, and the items and submenus in them.
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
        id: 'io.duobase.elsewise.editor.contextMenu.diff.submenu',
        order: 10,
        items: {
          unstaged: 10,
          uncommitted: 20,
          branch: 30,
        },
        none: { id: 'io.duobase.elsewise.editor.contextMenu.diff.none', order: 20, items: { none: 10 } },
      },
    },
  },
  refactor: { id: 'io.duobase.elsewise.editor.contextMenu.refactor', order: 40, items: { rename: 10 } },
} as const;

/**
 * A plugin's additions to a context menu.
 *
 * A submenu with no shown items is hidden.
 *
 * ```ts
 * editor.addContextMenus([
 *   {
 *     submenus: { 'example.tone': 'Tone of voice' },
 *     groups: {
 *       'example.reactions': { order: 50 }, // In the menu, after the built-in groups.
 *       'example.tone': { order: 60 },
 *       'example.tones': { menu: 'example.tone' }, // In the submenu.
 *     },
 *     items: {
 *       [DEFAULT_EDITOR_CONTEXT_MENU.refactor.id]: [{ type: 'item', order: 20, command: 'example.excuse' }],
 *       'example.reactions': [{ type: 'item', order: 10, command: 'example.shrug' }],
 *       'example.tone': [{ type: 'submenu', submenu: 'example.tone' }], // Opens the submenu.
 *       'example.tones': [{ type: 'item', order: 10, command: 'example.uwu' }],
 *     },
 *   },
 * ]);
 * ```
 */
export interface ContextMenu {
  /**
   * The labels of the submenus this menu declares, by id. A submenu is omitted if its id already exists. Its label
   * cannot be blank.
   *
   * See {@link ContextMenuGroup.menu} for adding a group to a submenu, and {@link ContextMenuSubmenuItem.submenu} for
   * opening it.
   */
  // TODO: This might need to change to support localization in the future.
  readonly submenus: Readonly<Record<string, string>>;

  /**
   * The groups this menu declares, by id. A group is omitted if its id already exists.
   *
   * See {@link ContextMenuGroup}.
   */
  readonly groups: Readonly<Record<string, ContextMenuGroup>>;

  /**
   * The items this menu adds to groups, by the group's id. The items of a group whose id is invalid or missing are
   * omitted.
   *
   * See {@link ContextMenuGroup} for declaring a group, and {@link ContextMenuItem} and
   * {@link ContextMenuSubmenuItem} for the items.
   */
  readonly items: Readonly<Record<string, readonly (ContextMenuItem | ContextMenuSubmenuItem)[]>>;
}

/**
 * A group of items, separated from other groups in the menu.
 *
 * See {@link ContextMenu} for adding items to it.
 */
export interface ContextMenuGroup {
  /**
   * The id of the submenu this group is in, or none for the menu itself. Omitted if the id is invalid or missing.
   *
   * See {@link ContextMenu} for declaring a submenu.
   */
  readonly menu?: string;

  /**
   * The order of this group in its menu, shown lowest first and by id when equal. Groups without one are shown last.
   */
  readonly order?: number;
}

/**
 * An item that runs a command.
 */
export interface ContextMenuItem {
  readonly type: 'item';

  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The label shown instead of the command's, where the menu gives it context, e.g. `None` in `Compare with…`.
   */
  readonly label?: string;

  /**
   * The id of the command it runs, e.g. `DEFAULT_COMMANDS.editor.lsp.rename`. Omitted if the id is invalid, missing or
   * already exists in the group.
   *
   * See {@link DEFAULT_COMMANDS} for the built-in commands.
   */
  readonly command: string;
}

/**
 * An item that opens a submenu.
 */
export interface ContextMenuSubmenuItem {
  readonly type: 'submenu';

  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The id of the submenu it opens. Omitted if the id is invalid, missing or already exists in the group.
   *
   * See {@link ContextMenu} for declaring a submenu.
   */
  readonly submenu: string;
}
