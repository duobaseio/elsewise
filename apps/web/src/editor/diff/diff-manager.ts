import type { EditorView } from '@codemirror/view';
import type { Disposable, EditorDiffSource, EditorDiffSourceGroup, EditorDiffs } from '@elsewise/frontend-plugin';
import { EDITOR_DIFF } from '@/editor/diff/diff';

/**
 * The diffs of documents against sources as plugins see them.
 */
export class DiffManager implements EditorDiffs {
  private added: readonly (readonly EditorDiffSourceGroup[])[] = [];
  private currentGroups: readonly EditorDiffSourceGroup[] = [];
  private currentSources: readonly EditorDiffSource[] = [];

  constructor(private readonly notify: () => void) {}

  /**
   * The groups, one per id, sorted by order, with their sources sorted by order.
   */
  get groups(): readonly EditorDiffSourceGroup[] {
    return this.currentGroups;
  }

  /**
   * The sources of every group, in the groups' order.
   */
  get sources(): readonly EditorDiffSource[] {
    return this.currentSources;
  }

  add(groups: readonly EditorDiffSourceGroup[]): Disposable {
    const added = [...groups];
    this.added = [...this.added, added];
    this.currentGroups = this.merge(this.added.flat());
    this.currentSources = this.currentGroups.flatMap((group) => group.sources);
    this.notify();
    return () => {
      this.added = this.added.filter((other) => other !== added);
      this.currentGroups = this.merge(this.added.flat());
      this.currentSources = this.currentGroups.flatMap((group) => group.sources);
      this.notify();
    };
  }

  get(view: EditorView): string | null {
    return view.state.facet(EDITOR_DIFF)?.source ?? null;
  }

  set(view: EditorView, id: string | null): void {
    const diff = view.state.facet(EDITOR_DIFF);
    if (diff !== null && (id === null || this.currentSources.some((source) => source.id === id))) {
      diff.source = id;
    }
  }

  // Merges the groups that share an id, sorted. `order` comes from the first group that sets it, and a source whose id
  // came earlier is skipped.
  private merge(groups: readonly EditorDiffSourceGroup[]): EditorDiffSourceGroup[] {
    const merged = new Map<string, { order?: number; sources: EditorDiffSource[] }>();
    const ids = new Set<string>();
    for (const group of groups) {
      let existing = merged.get(group.id);
      if (existing === undefined) {
        existing = { ...(group.order === undefined ? {} : { order: group.order }), sources: [] };
        merged.set(group.id, existing);
      } else if (group.order !== undefined) {
        if (existing.order === undefined) {
          existing.order = group.order;
        } else if (existing.order !== group.order) {
          console.warn(`Diff source group ${group.id} already has order ${existing.order}, ignoring ${group.order}`);
        }
      }

      for (const source of group.sources) {
        if (ids.has(source.id)) {
          console.warn(`Diff source ${source.id} was already added`);
          continue;
        }

        ids.add(source.id);
        existing.sources.push(source);
      }
    }

    return Array.from(merged, ([id, group]) => ({
      id,
      ...group,
      sources: group.sources.sort(
        (a, b) =>
          (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
          a.label.localeCompare(b.label),
      ),
    })).sort(
      (a, b) =>
        (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
    );
  }
}
