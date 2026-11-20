import type { Panel } from './panels';

/**
 * A group, or a split of the space between several.
 */
export type Layout = Group | Split;

/**
 * Panels stacked in the same place.
 */
export interface Group {
  /**
   * The panels, in the order of their tabs.
   */
  readonly panels: readonly Panel[];

  /**
   * The panel shown, or null if the group is hidden.
   */
  readonly shown: Panel | null;
}

/**
 * A row or column of groups and splits.
 */
export interface Split {
  readonly direction: 'row' | 'column';

  /**
   * The groups and splits, from left to right in a row and top to bottom in a column.
   */
  readonly children: readonly Layout[];
}
