import type { EditorView } from '@codemirror/view';
import type { Disposable } from '@elsewise/plugin';

/**
 * The built-in diff groups and sources.
 *
 * See {@link EditorDiffSourceGroup}.
 */
export const DEFAULT_DIFF_SOURCE_GROUPS = {
  git: {
    id: 'io.duobase.elsewise.diff.git',
    order: 10,
    sources: {
      unstaged: { id: 'elsewise.diff.unstaged', order: 10 },
      uncommitted: { id: 'elsewise.diff.uncommitted', order: 20 },
      branch: { id: 'elsewise.diff.branch', order: 30 },
    },
  },
} as const;

/**
 * The diffs of documents against sources, such as the index or `HEAD`.
 */
export interface EditorDiffs {
  /**
   * Adds `groups`, and their sources against which a document can be diffed.
   *
   * ```ts
   * editor.diffs.add([
   *   // Sources in a built-in group
   *   {
   *     id: DEFAULT_DIFF_SOURCE_GROUPS.git.id,
   *     sources: [{ id: 'example.stash', order: 40, label: 'Stash', base: stash }],
   *   },
   *
   *   // After the built-in groups
   *   { id: 'example.agent', order: 20, sources: [{ id: 'example.turn', label: 'This Turn', base: turn }] },
   * ]);
   * ```
   *
   * Returns a disposable that removes the `groups`. The documents diffed against their sources stop being diffed.
   */
  add(groups: readonly EditorDiffSourceGroup[]): Disposable;

  /**
   * Returns the id of the source which `view` is diffed against.
   */
  get(view: EditorView): string | null;

  /**
   * Diffs the `view` against the source with `id`.
   *
   * Does nothing if no source has `id`.
   */
  set(view: EditorView, id: string | null): void;
}

/**
 * A group of sources, separated from other groups in menus.
 *
 * Groups with the same id are merged. `order` uses the first defined value.
 */
export interface EditorDiffSourceGroup {
  /**
   * The id of this group, e.g. `DEFAULT_DIFF_SOURCE_GROUPS.git.id`.
   *
   * See {@link DEFAULT_DIFF_SOURCE_GROUPS} for the built-in groups.
   */
  readonly id: string;

  /**
   * The order of this group in menus, shown lowest first and by id when equal. Groups without one are shown last.
   *
   * A differing order added later is ignored.
   */
  readonly order?: number;

  /**
   * The sources in this group. A source whose id already exists in any group is ignored.
   */
  readonly sources: readonly EditorDiffSource[];
}

/**
 * A source against which a document can be diffed, e.g. the index or `HEAD`.
 */
export interface EditorDiffSource {
  /**
   * The source's id, namespaced by the plugin's, e.g. `io.example.turn`.
   */
  readonly id: string;

  /**
   * The order of this source in its group, shown lowest first and by label when equal. Sources without one are shown
   * last.
   */
  readonly order?: number;

  /**
   * The label of the comparison, shown in menus, e.g. `Uncommitted`.
   */
  readonly label: string;

  /**
   * Returns whether the source is shown in menus. Defaults to true.
   */
  // TODO: Figure out how to implement this once git daemon is done.
  shown?(view: EditorView): boolean;

  /**
   * Returns the base to diff against.
   */
  // TODO: Figure out how to implement this once git daemon is done.
  base(): Promise<EditorDiffContent>;
}

/**
 * One side of a comparison.
 */
export interface EditorDiffContent {
  /**
   * The side's label, e.g. `HEAD (a1b2c3d)` or `Turn 3`. Defaults label.
   */
  readonly label?: string;

  /**
   * The document's content, or null if it did not exist.
   */
  readonly code: string | null;
}
