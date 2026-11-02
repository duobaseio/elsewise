import type { EditorView } from '@codemirror/view';
import type { Disposable } from '../plugin.ts';

/**
 * The ids of the built-in diff sources.
 *
 * See {@link EditorDiffSource}.
 */
export const DEFAULT_DIFF_SOURCES = {
  unstaged: 'elsewise.diff.unstaged',
  uncommitted: 'elsewise.diff.uncommitted',
  branch: 'elsewise.diff.branch',
} as const;

/**
 * The diffs of documents against sources, such as the index or `HEAD`.
 */
export interface EditorDiffs {
  /**
   * Adds `sources` against which a document can be diffed.
   *
   * ```ts
   * editor.diffs.add([
   *   { id: 'example.turn', label: 'This Turn', base: async () => ({ label: 'Turn 3', code: await snapshot.read() }) },
   * ]);
   * ```
   *
   * A source with an already existing id is rejected.
   *
   * Returns a disposable that removes the `sources`. The documents diffed against them stop being diffed.
   */
  add(sources: readonly EditorDiffSource[]): Disposable;

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
 * A source against which a document can be diffed, e.g. the index or `HEAD`.
 */
export interface EditorDiffSource {
  /**
   * The source's id, namespaced by the plugin's, e.g. `io.example.turn`.
   */
  readonly id: string;

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
