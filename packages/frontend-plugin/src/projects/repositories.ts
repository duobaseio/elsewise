import type { ComponentType } from 'react';

/**
 * Returns the repositories that match `query`, or a list of suggestions when `query` is empty.
 *
 * `signal` aborts once the query changes.
 */
export type RepositorySource = (query: string, options: { signal: AbortSignal }) => Promise<readonly RepositoryGroup[]>;

/**
 * Items shown together, separated from other groups in the list New project shows.
 *
 * Groups with the same id, from any source, are merged. `order`, `icon` and `label` use the first defined values, and
 * the items follow in the order the sources were added. Groups without items are hidden.
 */
export interface RepositoryGroup {
  /**
   * The group's id, namespaced by the plugin's, e.g. `io.example.github.matthias`.
   */
  readonly id: string;

  /**
   * The order of this group in the list, shown lowest first and by id when equal. Groups without one are shown last.
   */
  readonly order?: number;

  /**
   * The icon shown before the label, in a 16px square.
   */
  readonly icon?: ComponentType;

  /**
   * The label shown above the group's items. A group without one is set apart only by a separator.
   */
  readonly label?: string;

  /**
   * The items, in the order shown.
   */
  readonly items: readonly RepositoryItem[];
}

/**
 * An item that clones the repository at `url`.
 */
export interface RepositoryItem {
  /**
   * The icon shown before the name, in a 16px square.
   */
  readonly icon?: ComponentType;

  /**
   * The name shown, e.g. `elsewise/dotfiles`.
   */
  readonly name: string;

  /**
   * The URL the daemon clones using the credentials on the daemon's machine.
   */
  readonly url: string;
}
