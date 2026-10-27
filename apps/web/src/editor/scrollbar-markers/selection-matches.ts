import { highlightSelectionMatches, SearchCursor } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { type ScrollbarMarker, scrollbarMarkerSources } from '@/editor/scrollbar-markers/scrollbar-markers';

/**
 * The maximum length of a selection whose matches are marked.
 */
const MAX_SELECTION_LENGTH = 200;

/**
 * The maximum number of scrollbar markers for selection matches.
 */
const MAX_MATCHES = 100;

/**
 * The maximum number of lines in a document whose selection matches are marked, since each selection change scans the
 * whole document.
 */
const MAX_LINES = 10_000;

/**
 * Returns the extension that highlights the other occurrences of the selected text in the code, and marks them on the
 * scrollbar throughout the document.
 */
export function selectionMatches(): Extension {
  return [
    highlightSelectionMatches(),
    scrollbarMarkerSources.of({
      update: (update) => update.selectionSet || update.docChanged,
      // Follows `highlightSelectionMatches`' rules, which keeps its matches to itself and to the viewport.
      markers(view) {
        const { state } = view;
        const { main, ranges } = state.selection;
        if (
          state.doc.lines > MAX_LINES ||
          ranges.length > 1 ||
          main.empty ||
          main.to - main.from > MAX_SELECTION_LENGTH
        ) {
          return [];
        }

        const markers: ScrollbarMarker[] = [];
        const cursor = new SearchCursor(state.doc, state.sliceDoc(main.from, main.to));
        for (let next = cursor.next(); !next.done; next = cursor.next()) {
          const { from, to } = next.value;
          // Skips the selection itself, which shows as the selection.
          if (from >= main.to || to <= main.from) {
            markers.push({ from, to, kind: 'usage' });
          }
          if (markers.length > MAX_MATCHES) {
            return [];
          }
        }
        return markers;
      },
    }),
  ];
}
