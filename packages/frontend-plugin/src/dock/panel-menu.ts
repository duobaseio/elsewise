import type { CustomPanel } from './panels';

/**
 * The panel menu's built-in groups and items.
 */
export const DEFAULT_PANEL_MENU = {
  terminals: {
    id: 'io.duobase.elsewise.dock.panelMenu.terminals',
    order: 10,
    items: { terminal: 10 },
  },
} as const;

/**
 * A group of items, separated from other groups in a panel menu.
 *
 * Groups with the same id are merged. `order` and `in` use the first defined values.
 *
 * ```ts
 * docks.addPanelMenu([
 *   // Items in a built-in group
 *   { id: DEFAULT_PANEL_MENU.terminals.id, items: [{ order: 20, source: 'example/report' }] },
 *
 *   // After the built-in groups.
 *   { id: 'example.charts', order: 50, items: [{ order: 10, source: 'example/chart' }] },
 *
 *   // Submenu trigger
 *   { id: 'example.more', order: 60, items: [{ label: 'More', submenu: 'example.more' }] },
 *   // Submenu content
 *   { id: 'example.tools', in: 'example.more', items: [{ order: 10, source: 'example/notes' }] },
 * ]);
 * ```
 */
export interface PanelMenuGroup {
  /**
   * The id of this group, e.g. `DEFAULT_PANEL_MENU.terminals.id`.
   *
   * See {@link DEFAULT_PANEL_MENU} for the built-in groups.
   */
  readonly id: string;

  /**
   * The order of this group in the menu, shown lowest first and by id when equal. Groups without one are shown last.
   *
   * A differing order added later is ignored.
   */
  readonly order?: number;

  /**
   * The id of the submenu this group is in, or none for the menu itself.
   *
   * A differing submenu added later is ignored.
   *
   * See {@link PanelMenuSubmenuItem} for opening a submenu.
   */
  readonly in?: string;

  /**
   * The items in this group.
   */
  readonly items: readonly (PanelMenuItem | PanelMenuSubmenuItem)[];
}

/**
 * An item that adds a panel of a source, as the last tab of the button's group.
 */
export interface PanelMenuItem {
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The label shown instead of the source's, where the menu gives it context.
   */
  readonly label?: string;

  /**
   * The id of the source, e.g. `DEFAULT_PANEL_SOURCES.terminal`. The item is hidden while no source has the id, or if
   * the source's panels are tabless.
   */
  readonly source: CustomPanel['type'];
}

/**
 * An item that opens a submenu.
 *
 * The submenu shows the groups whose `in` is the item's `submenu`. The item is hidden when none of them has an item to
 * show.
 */
export interface PanelMenuSubmenuItem {
  /**
   * The order of this item in its group, shown lowest first and by label when equal. Items without one are shown last.
   */
  readonly order?: number;

  /**
   * The label shown.
   */
  readonly label: string;

  /**
   * The id of the submenu it opens, namespaced by the plugin's.
   *
   * See {@link PanelMenuGroup.in} for adding a group to it.
   */
  readonly submenu: string;
}
