import type { Extension } from '@codemirror/state';
import { EditorView, type LayerMarker, layer, RectangleMarker } from '@codemirror/view';

/**
 * Returns an extension that draws vertical guides at the given `columns`.
 */
export function visualGuides(columns: readonly number[]): Extension {
  if (columns.length === 0) {
    return [];
  }

  return [
    EditorView.theme({
      '.cm-visual-guide': { borderLeft: '1px solid' },
      '.cm-content:not(.cm-lineWrapping)': { minWidth: `calc(${Math.max(...columns) + 8}ch)` },
    }),
    layer({
      above: false,
      class: 'cm-visual-guides',
      markers: (view) => markers(view, columns),
      update: (update) => update.heightChanged || update.viewportChanged,
    }),
  ];
}

function markers(view: EditorView, columns: readonly number[]): LayerMarker[] {
  const origin = view.scrollDOM.getBoundingClientRect().left - view.scrollDOM.scrollLeft;
  const left = view.contentDOM.getBoundingClientRect().left - origin;
  const line = view.contentDOM.querySelector('.cm-line');
  const padding = line === null ? 0 : Number.parseFloat(getComputedStyle(line).paddingLeft);
  const height = Math.max(view.contentHeight, view.scrollDOM.clientHeight);
  return columns.map(
    (column) =>
      new RectangleMarker('cm-visual-guide', left + padding + column * view.defaultCharacterWidth, 0, null, height),
  );
}
