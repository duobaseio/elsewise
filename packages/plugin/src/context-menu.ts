/**
 * The editor context menu's built-in groups.
 */
export const DEFAULT_EDITOR_CONTEXT_MENU = {
  actions: { id: 'io.duobase.elsewise.editor.contextmenu.actions', order: 5, items: { show: 10 } },
  clipboard: {
    id: 'io.duobase.elsewise.editor.contextmenu.clipboard',
    order: 10,
    items: { cut: 10, copy: 20, paste: 30 },
  },
  navigate: {
    id: 'io.duobase.elsewise.editor.contextmenu.navigate',
    order: 13,
    items: { usages: 10, definition: 20 },
  },
  refactor: { id: 'io.duobase.elsewise.editor.contextmenu.refactor', order: 16, items: { rename: 10 } },
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
 *       'example.reactions': { order: 30 }, // In the menu, after the built-in groups.
 *       'example.tone': { order: 40 },
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
   * The labels of the submenus this menu declares, by id. A submenu is ignored if its id is already declared. its
   * label cannot be blank.
   *
   * See {@link ContextMenuGroup.menu} for adding a group to a submenu, and {@link ContextMenuSubmenuItem.submenu} for
   * opening it.
   */
  // TODO: This might need to change to support localization in the future.
  readonly submenus: Readonly<Record<string, string>>;
  /**
   * The groups this menu declares, by id. A group is ignored if its id is already declared.
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
   * The id of the command it runs, e.g. `DEFAULT_COMMANDS.editor.lsp.rename`. Omitted if the id is invalid or missing.
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
   * The id of the submenu it opens. Omitted if the id is invalid or missing.
   *
   * See {@link ContextMenu} for declaring a submenu.
   */
  readonly submenu: string;
}
