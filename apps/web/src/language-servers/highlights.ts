import { language } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Facet, type Range, StateEffect, StateField } from '@codemirror/state';
import {
  closeHoverTooltips,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import {
  type DocumentHighlight,
  DocumentHighlightKind,
  type DocumentHighlightParams,
} from 'vscode-languageserver-protocol';
import { symbol } from '@/components/code-editor/symbol';

const READ = Decoration.mark({ class: 'cm-lsp-highlight' });
const WRITE = Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-write' });

const showHighlights = StateEffect.define<DecorationSet>();

/**
 * Whether resting the caret on a symbol highlights its usages, true unless set.
 */
export const highlightUsages = Facet.define<boolean, boolean>({ combine: (values) => values.at(-1) ?? true });

/**
 * Where the mouse was pressed in the code to highlight the usages at the caret, or `null` once it has moved. Hovers
 * stay closed while it's set, so the click shows the usages rather than a tooltip.
 */
export const highlightClick = StateField.define<{ x: number; y: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlightClick)) {
        value = effect.value;
      }
    }
    return value;
  },
});

const setHighlightClick = StateEffect.define<{ x: number; y: number } | null>();

// While usages are highlighted, closes the hovers on a click in the code, and keeps them closed until the mouse moves
// away, so they open only on hover.
const clicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (view.state.facet(highlightUsages) && view.contentDOM.contains(event.target as Node)) {
      view.dispatch({ effects: [setHighlightClick.of({ x: event.clientX, y: event.clientY }), closeHoverTooltips] });
    }
    return false;
  },
  mousemove(event, view) {
    const click = view.state.field(highlightClick);
    // Ignores dragging a selection, and the move to the same spot that can follow a click.
    if (click && event.buttons === 0 && (event.clientX !== click.x || event.clientY !== click.y)) {
      view.dispatch({ effects: setHighlightClick.of(null) });
    }
    return false;
  },
});

/**
 * Returns the extension that highlights the usages of the symbol at the caret while nothing is selected.
 */
export function serverHighlights(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { documentHighlight: {} } },
    editorExtension: [highlights, highlightClick, clicks],
  };
}

const highlights = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    frame: number | undefined;
    /**
     * The request awaiting its answer, which is dropped when the caret or document changes first.
     */
    request: { drop: boolean } | null = null;

    update(update: ViewUpdate) {
      for (const transaction of update.transactions) {
        for (const effect of transaction.effects) {
          if (effect.is(showHighlights)) {
            this.decorations = effect.value;
          }
        }
      }
      const enabled = update.state.facet(highlightUsages);
      if (
        !update.docChanged &&
        !update.selectionSet &&
        !update.focusChanged &&
        enabled === update.startState.facet(highlightUsages)
      ) {
        return;
      }

      const { selection } = update.state;
      const head = selection.main.head;
      const word = symbol(update.state);
      const named = word !== null && (word.is(tags.name) || update.state.facet(language) === null);
      const caret = enabled && named && selection.ranges.length === 1 && selection.main.empty && update.view.hasFocus;

      let inside = false;
      this.decorations.between(head, head, (from, to) => {
        inside ||= from <= head && head <= to;
      });

      if (caret && inside && !update.docChanged) {
        return;
      }

      this.decorations = Decoration.none;
      this.cancel();
      // Asks on the next frame, so the caret's moves within one frame make one request.
      if (caret) {
        this.frame = requestAnimationFrame(() => void this.ask(update.view));
      }
    }

    async ask(view: EditorView): Promise<void> {
      const plugin = LSPPlugin.get(view);
      if (!plugin?.client.serverCapabilities?.documentHighlightProvider) {
        return;
      }

      const { doc } = view.state;
      const head = view.state.selection.main.head;
      const request = { drop: false };
      this.request = request;
      plugin.client.sync();
      const highlights = await plugin.client
        .request<DocumentHighlightParams, DocumentHighlight[] | null>('textDocument/documentHighlight', {
          textDocument: { uri: plugin.uri },
          position: plugin.toPosition(head),
        })
        .catch(() => null);
      if (request.drop || view.state.doc !== doc || view.state.selection.main.head !== head) {
        return;
      }

      // Skips ranges past the end of the document, and empty ones, which a mark can't show.
      const marks: Range<Decoration>[] = [];
      for (const { range, kind } of highlights ?? []) {
        if (range.start.line >= doc.lines || range.end.line >= doc.lines) {
          continue;
        }
        const from = Math.min(plugin.fromPosition(range.start, doc), doc.line(range.start.line + 1).to);
        const to = Math.min(plugin.fromPosition(range.end, doc), doc.line(range.end.line + 1).to);
        if (from < to) {
          marks.push((kind === DocumentHighlightKind.Write ? WRITE : READ).range(from, to));
        }
      }
      view.dispatch({ effects: showHighlights.of(Decoration.set(marks, true)) });
    }

    cancel() {
      if (this.frame !== undefined) {
        cancelAnimationFrame(this.frame);
      }
      if (this.request) {
        this.request.drop = true;
        this.request = null;
      }
    }

    destroy() {
      this.cancel();
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
