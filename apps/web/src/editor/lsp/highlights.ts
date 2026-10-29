import { language } from '@codemirror/language';
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client';
import { Facet, type Range, StateEffect } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import {
  type DocumentHighlight,
  DocumentHighlightKind,
  type DocumentHighlightParams,
} from 'vscode-languageserver-protocol';
import { closeHoverOnClick } from '@/editor/hover';
import { symbol } from '@/editor/lsp/symbol';
import { type ScrollbarMarker, scrollbarMarkerSources } from '@/editor/scrollbar-markers/scrollbar-markers';

const READ = Decoration.mark({ class: 'cm-lsp-highlight' });
const WRITE = Decoration.mark({ class: 'cm-lsp-highlight cm-lsp-highlight-write' });

const showHighlights = StateEffect.define<DecorationSet>();

/**
 * Whether resting the caret on a symbol highlights its usages, true unless set.
 */
export const highlightUsages = Facet.define<boolean, boolean>({ combine: (values) => values.at(-1) ?? true });

/**
 * Returns the extension that highlights the usages of the symbol at the caret while nothing is selected.
 */
export function serverHighlights(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { documentHighlight: {} } },
    editorExtension: [
      highlights,
      closeHoverOnClick.compute([highlightUsages], (state) => state.facet(highlightUsages)),
      scrollbarMarkerSources.of({
        // Whatever may change the highlights, since they are dropped without an effect.
        update: (update) =>
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged ||
          update.transactions.some((tr) => tr.effects.some((effect) => effect.is(showHighlights))),
        markers(view) {
          const markers: ScrollbarMarker[] = [];
          view.plugin(highlights)?.decorations.between(0, view.state.doc.length, (from, to) => {
            markers.push({ from, to, kind: 'usage' });
          });
          return markers;
        },
      }),
    ],
  };
}

const highlights = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    frame: number | undefined;
    /**
     * The request in flight, which is dropped when the caret or document changes first.
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
