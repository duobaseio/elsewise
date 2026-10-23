import { type Extension, Prec } from '@codemirror/state';
import { BlockType, layer, RectangleMarker } from '@codemirror/view';

/**
 * Returns the extension that draws the lines with a cursor in a layer behind the selection, and in front of the diff's
 * fills.
 *
 * CodeMirror's `highlightActiveLine` fills the lines themselves, so a diff's fill on the same line replaces it.
 */
export function drawActiveLine(): Extension {
  // Low, since a layer later in order is drawn further behind. This one goes behind the selection, and in front of the
  // diff's fills, which are lowest.
  return Prec.low(
    layer({
      above: false,
      class: 'cm-activeLineLayer',
      update: (update) => update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged,
      markers: (view) => {
        // Markers are placed relative to the scrolled content's corner.
        const scroller = view.scrollDOM.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const left = content.left - scroller.left + view.scrollDOM.scrollLeft;
        const top = view.documentTop - scroller.top + view.scrollDOM.scrollTop;

        const markers: RectangleMarker[] = [];
        let last = -1;
        for (const range of view.state.selection.ranges) {
          const block = view.lineBlockAt(range.head);
          const line = Array.isArray(block.type)
            ? (block.type.find(
                (part) => part.type === BlockType.Text && part.from <= range.head && range.head <= part.to,
              ) ?? block)
            : block;

          if (line.from > last) {
            markers.push(new RectangleMarker('cm-activeLine', left, top + line.top, content.width, line.height));
            last = line.from;
          }
        }
        return markers;
      },
    }),
  );
}
