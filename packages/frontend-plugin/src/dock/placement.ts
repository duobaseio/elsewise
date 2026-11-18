import type { Panel, TabPanel } from './panels';

/**
 * Where a panel is placed.
 *
 * ```ts
 * { tab: 'after', of: panel } // A tab after `panel`, (relative, inside a group).
 * { tab: 'last', with: panel } // The last tab in the group that `panel` is in, (absolute, inside a group).
 * { group: 'right', of: panel } // A new group, right of the group that `panel` is in, (relative, outside a group).
 * { edge: 'bottom' } // A new group, along the bottom of the dock, (absolute, outside a group).
 * ```
 */
export type Placement = TabPlacement | GroupPlacement;

/**
 * A place among a group's tabs.
 */
export type TabPlacement =
  | { readonly tab: 'before' | 'after'; readonly of: TabPanel }
  | { readonly tab: 'first' | 'last'; readonly with: TabPanel };

/**
 * A place for a new group.
 *
 * A group beside another is as tall or wide as that group. A group along an edge spans the dock.
 */
export type GroupPlacement =
  | { readonly group: 'left' | 'right' | 'above' | 'below'; readonly of: Panel }
  | { readonly edge: 'left' | 'right' | 'top' | 'bottom' };
