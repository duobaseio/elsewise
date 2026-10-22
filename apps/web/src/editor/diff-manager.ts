import type { EditorView } from '@codemirror/view';
import type { Disposable, EditorDiffSource, EditorDiffs } from '@elsewise/plugin';
import { EDITOR_DIFF } from '@/editor/diff';

/**
 * The diffs of documents against sources as plugins see them.
 */
export class DiffManager implements EditorDiffs {
  private addedSources: readonly (readonly EditorDiffSource[])[] = [];
  private currentSources: readonly EditorDiffSource[] = [];

  constructor(private readonly notify: () => void) {}

  /**
   * The sources, in order of addition.
   */
  get sources(): readonly EditorDiffSource[] {
    return this.currentSources;
  }

  add(sources: readonly EditorDiffSource[]): Disposable {
    const ids = new Set(this.currentSources.map((source) => source.id));
    const added = sources.filter((source) => {
      if (ids.has(source.id)) {
        console.warn(`Diff source ${source.id} already exists`);
        return false;
      }

      ids.add(source.id);
      return true;
    });
    this.addedSources = [...this.addedSources, added];
    this.currentSources = this.addedSources.flat();
    this.notify();
    return () => {
      this.addedSources = this.addedSources.filter((other) => other !== added);
      this.currentSources = this.addedSources.flat();
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
}
