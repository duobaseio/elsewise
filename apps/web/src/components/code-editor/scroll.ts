import type { SelectionRange, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Returns the effect that scrolls `range` to the middle of `view`, unless it is visible already.
 */
export function scroll(range: SelectionRange, view: EditorView): StateEffect<unknown> {
  const bounds = view.scrollDOM.getBoundingClientRect();
  const start = view.coordsAtPos(range.from);
  const end = view.coordsAtPos(range.to);
  const visible = start && end && start.top >= bounds.top && end.bottom <= bounds.bottom;
  return EditorView.scrollIntoView(range, { y: visible ? 'nearest' : 'center' });
}
