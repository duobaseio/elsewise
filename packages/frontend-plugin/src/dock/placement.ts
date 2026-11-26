import type { Panel } from './panels';

/**
 * Where a panel is placed.
 *
 * ```ts
 * { tab: 'after', of: panel } // A tab after `panel`, (relative, inside a group).
 * { tab: 'last', with: panel } // The last tab in the group that `panel` is in, (absolute, inside a group).
 * { group: 'right', of: panel } // A new group, right of the group that `panel` is in, (relative, outside a group).
 * { edge: 'bottom' } // A new group, along the bottom of the dock, (absolute, outside a group).
 * { edge: 'bottom', height: 200 } // The same group, 200 pixels tall.
 * ```
 */
export type Placement = TabPlacement | GroupPlacement;

/**
 * A place among a group's tabs.
 */
export type TabPlacement =
  | { readonly tab: 'before' | 'after'; readonly of: Panel }
  | { readonly tab: 'first' | 'last'; readonly with: Panel };

/**
 * A place for a new group.
 *
 * A group beside another is as tall or wide as that group. A group along an edge spans the dock.
 *
 * `height` and `width` are in pixels, and limited to the space that the dock has. Without one, the dock decides the
 * size.
 */
export type GroupPlacement =
  | { readonly group: 'above' | 'below'; readonly of: Panel; readonly height?: number }
  | { readonly group: 'left' | 'right'; readonly of: Panel; readonly width?: number }
  | { readonly edge: 'top' | 'bottom'; readonly height?: number }
  | { readonly edge: 'left' | 'right'; readonly width?: number };
