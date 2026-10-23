import { type Chunk, getChunks, getOriginalDoc, mergeViewSiblings } from '@codemirror/merge';
import { type Extension, Facet, Prec, RangeSet } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, layer, RectangleMarker, ViewPlugin } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import type { Disposable } from '@elsewise/plugin';
import type { RevertButtons } from '@/editor/diff/revert-buttons';

/**
 * The editor's diff state, or null in a view outside an editor.
 */
export const EDITOR_DIFF = Facet.define<DiffState, DiffState | null>({ combine: (values) => values[0] ?? null });

/**
 * Which source an editor's file is diffed against, and in which layout.
 *
 * One per editor, shared by its views, since a change of layout replaces them. Commands and plugins read and change it
 * through {@link EDITOR_DIFF}, and the editor renders from it.
 *
 * A change updates the views, so that what they show from it, e.g. whether a toolbar's command is enabled, is
 * evaluated again.
 */
export class DiffState {
  /**
   * The extension that gives a view this state.
   */
  readonly extension: Extension;
  private readonly listeners = new Set<() => void>();
  private readonly views = new Set<EditorView>();
  private currentSource: string | null;
  private currentLayout: DiffLayout;

  constructor(source: string | null, layout: DiffLayout) {
    this.currentSource = source;
    this.currentLayout = layout;
    this.extension = [
      EDITOR_DIFF.of(this),
      ViewPlugin.define((view) => {
        this.views.add(view);
        // Later, since the view is not yet built.
        queueMicrotask(() => this.notifyListeners());
        return {
          update: (update) => {
            if (getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks) {
              this.notifyListeners();
            }
          },
          destroy: () => this.views.delete(view),
        };
      }),
    ];
  }

  /**
   * The id of the source that the file is diffed against, or null if it is not diffed.
   */
  get source(): string | null {
    return this.currentSource;
  }

  set source(source: string | null) {
    if (this.currentSource !== source) {
      this.currentSource = source;
      this.notify();
    }
  }

  /**
   * The layout that the diff is shown in.
   */
  get layout(): DiffLayout {
    return this.currentLayout;
  }

  set layout(layout: DiffLayout) {
    if (this.currentLayout !== layout) {
      this.currentLayout = layout;
      this.notify();
    }
  }

  /**
   * Registers a `listener` that is called when the source or layout changes, a view is added, or a view's chunks
   * change.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.notifyListeners();

    // Later, since the state may change during a view update, when dispatching is not allowed.
    queueMicrotask(() => {
      for (const view of this.views) {
        view.dispatch({});
      }
    });
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Diff listener failed', error);
      }
    }
  }
}

export function revertGutter(buttons: RevertButtons): Extension {
  // Whether to position revert button beside the deleted or added block.
  // Unified and split views show the revert button next to deleted and added blocks respectively.
  const besideDeleted = (view: EditorView, chunk: Chunk) =>
    mergeViewSiblings(view) === null ? chunk.fromA < chunk.toA : chunk.fromB === chunk.toB;

  return [
    gutter({
      class: 'cm-revertGutter',
      markers: (view) =>
        RangeSet.of(
          (getChunks(view.state)?.chunks ?? [])
            .filter((chunk) => !besideDeleted(view, chunk))
            .map((chunk) => new RevertMarker(chunk.fromB, buttons).range(chunk.fromB)),
        ),
      widgetMarker: (view, _, block) =>
        getChunks(view.state)?.chunks.some((chunk) => chunk.fromB === block.from && besideDeleted(view, chunk))
          ? new RevertMarker(block.from, buttons)
          : null,
    }),
    EditorView.theme({
      '.cm-revertGutter': { width: '22px' },
      '.cm-revertGutter .cm-revert': { display: 'flex', justifyContent: 'center' },
    }),
  ];
}

class RevertMarker extends GutterMarker {
  constructor(
    private readonly pos: number,
    private readonly buttons: RevertButtons,
  ) {
    super();
  }

  override eq(other: RevertMarker): boolean {
    return other.pos === this.pos && other.buttons === this.buttons;
  }

  override toDOM(view: EditorView): Node {
    return this.buttons.container((event) => {
      // Keeps the focus in the editor.
      event.preventDefault();
      this.revertChunk(view);
    });
  }

  override destroy(dom: Node): void {
    this.buttons.release(dom);
  }

  // Based on `@codemirror/merge`'s `rejectChunk`, which only reverts in a unified view.
  private revertChunk(view: EditorView) {
    const chunk = getChunks(view.state)?.chunks.find((chunk) => chunk.fromB === this.pos);
    if (chunk === undefined) {
      return;
    }

    const { state } = view;
    const base = mergeViewSiblings(view)?.a.state.doc ?? getOriginalDoc(state);
    let insert = base.sliceString(chunk.fromA, Math.max(chunk.fromA, chunk.toA - 1));
    if (chunk.fromA !== chunk.toA && chunk.toB <= state.doc.length) {
      insert += state.lineBreak;
    }
    view.dispatch({
      changes: { from: chunk.fromB, to: Math.min(state.doc.length, chunk.toB), insert },
      userEvent: 'revert',
    });
  }
}

/**
 * Returns the extension that draws the changed lines and texts' fills in a layer behind the selection.
 *
 * CodeMirror's default diff views fill them on the lines themselves, hiding selection when diff colors are opaque.
 */
export function drawDiffs(): Extension {
  return [
    // Lowest, since a layer later in order is drawn further behind, and this one has to be behind the selection and the
    // active line.
    Prec.lowest(
      layer({
        above: false,
        class: 'cm-diffLayer',
        update: (update) =>
          update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks,
        markers: (view) => {
          // Markers are placed relative to the scrolled content's corner.
          const scroller = view.scrollDOM.getBoundingClientRect();
          const x = view.scrollDOM.scrollLeft - scroller.left;
          const y = view.scrollDOM.scrollTop - scroller.top;
          const copy = (className: string, rect: DOMRect) =>
            new RectangleMarker(className, rect.left + x, rect.top + y, rect.width, rect.height);
          // The base's lines were deleted, and the target's added, except the unified view's deleted chunks.
          const kind = getChunks(view.state)?.side === 'a' ? 'Deleted' : 'Added';
          return [
            ...[...view.contentDOM.querySelectorAll('.cm-changedLine')].map((line) =>
              copy(`cm-diff${kind}Line`, line.getBoundingClientRect()),
            ),
            ...[...view.contentDOM.querySelectorAll('.cm-deletedChunk')].map((chunk) =>
              copy('cm-diffDeletedLine', chunk.getBoundingClientRect()),
            ),
            // A span wrapped across lines has a rectangle on each.
            ...[...view.contentDOM.querySelectorAll('.cm-changedText')].flatMap((text) =>
              [...text.getClientRects()].map((rect) => copy(`cm-diff${kind}Text`, rect)),
            ),
            ...[...view.contentDOM.querySelectorAll('.cm-deletedChunk .cm-deletedText')].flatMap((text) =>
              [...text.getClientRects()].map((rect) => copy('cm-diffDeletedText', rect)),
            ),
          ];
        },
      }),
    ),
    EditorView.theme({
      '&.cm-merge-a .cm-changedLine, &.cm-merge-b .cm-changedLine, .cm-deletedChunk': {
        backgroundColor: 'transparent',
      },
      '&.cm-merge-a .cm-changedText, &.cm-merge-b .cm-changedText, .cm-deletedChunk .cm-deletedText': {
        background: 'none',
      },
      '.cm-content .cm-deletedChunk ::selection': { backgroundColor: 'transparent' },
    }),
  ];
}
