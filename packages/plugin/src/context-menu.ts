import * as z from 'zod';

export type ContextMenus = z.infer<typeof ContextMenus>;
export type ContextMenu = z.infer<typeof ContextMenu>;
export type ContextSubmenuId = z.infer<typeof ContextSubmenuId>;
export type ContextMenuGroupId = z.infer<typeof ContextMenuGroupId>;
export type ContextMenuGroup = z.infer<typeof ContextMenuGroup>;
export type ContextMenuItem = z.infer<typeof ContextMenuItem>;
export type ContextMenuSubmenuItem = z.infer<typeof ContextMenuSubmenuItem>;

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
 * A plugin's additions to the context menus.
 */
export const ContextMenus = z.lazy(() =>
  z.object({
    /**
     * The editor's context menu.
     *
     * See {@link DEFAULT_EDITOR_CONTEXT_MENU} for the built-in groups.
     */
    editor: ContextMenu.optional(),
  }),
);

/**
 * A context submenu's id that is unique across all submenus.
 *
 * It is recommended to namespace by plugin, i.e. `<plugin>.<submenu>`.
 */
export const ContextSubmenuId = z.string().regex(/\S/);

/**
 * A context menu group's id that is unique across all groups.
 *
 * It is recommended to namespace by plugin, i.e. `<plugin>.<group>`.
 */
export const ContextMenuGroupId = z.string().regex(/\S/);

/**
 * A plugin's additions to a context menu.
 *
 * A submenu with no shown items is hidden.
 */
export const ContextMenu = z.lazy(() =>
  z.object({
    /**
     * The labels of the submenus this menu declares, by id. A submenu is ignored if its id is already declared, and its
     * label cannot be blank.
     *
     * See {@link ContextMenuGroup.menu} for adding a group to a submenu, and {@link ContextMenuSubmenuItem.submenu} for
     * opening it.
     *
     * TODO: This might need to change to support localization in the future.
     */
    submenus: z.record(ContextSubmenuId, z.string().regex(/\S/)).default({}),
    /**
     * The groups this menu declares, by id. A group is ignored if its id is already declared.
     *
     * See {@link ContextMenuGroup}.
     */
    groups: z.record(ContextMenuGroupId, ContextMenuGroup).default({}),
    /**
     * The items this menu adds to groups, by the group's id. The items of a group whose id is invalid or missing are
     * omitted.
     *
     * See {@link ContextMenuGroup} for declaring a group, and {@link ContextMenuItem} and
     * {@link ContextMenuSubmenuItem} for the items.
     */
    items: z
      .record(ContextMenuGroupId, z.array(z.discriminatedUnion('type', [ContextMenuItem, ContextMenuSubmenuItem])))
      .default({}),
  }),
);

/**
 * A group of items, separated from other groups in the menu.
 *
 * See {@link ContextMenu} for adding items to it.
 */
export const ContextMenuGroup = z.object({
  /**
   * The id of the submenu this group is in, or none for the menu itself. Omitted if the id is invalid or missing.
   *
   * See {@link ContextMenu} for declaring a submenu.
   */
  menu: ContextSubmenuId.optional(),
  /**
   * The order of this group in its menu, shown lowest first and by id when equal. Defaults to 0.
   */
  order: z.number().default(0),
});

/**
 * An item that runs a command.
 */
export const ContextMenuItem = z.object({
  type: z.literal('item'),
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Defaults to 0.
   */
  order: z.number().default(0),
  /**
   * The id of the command it runs, e.g. `DEFAULT_COMMANDS.editor.lsp.rename`. Omitted if the id is invalid or missing.
   *
   * See {@link DEFAULT_COMMANDS} for the built-in commands.
   */
  command: z.string().regex(/\S/),
});

/**
 * An item that opens a submenu.
 */
export const ContextMenuSubmenuItem = z.object({
  type: z.literal('submenu'),
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Defaults to 0.
   */
  order: z.number().default(0),
  /**
   * The id of the submenu it opens. Omitted if the id is invalid or missing.
   *
   * See {@link ContextMenu} for declaring a submenu.
   */
  submenu: ContextSubmenuId,
});
