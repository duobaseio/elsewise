import { foldedRanges, unfoldEffect } from '@codemirror/language';
import { EditorSelection, type Extension, type SelectionRange, type StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

/**
 * Moves the cursor to the start of `range`, unfolding it if folded, and scrolls it into view.
 */
export function jump(view: EditorView, range: { from: number; to: number }): void {
  const effects: StateEffect<unknown>[] = [scroll(EditorSelection.range(range.from, range.to), view)];
  foldedRanges(view.state).between(range.from, range.from, (from, to) => {
    if (from < range.from && range.from < to) {
      effects.push(unfoldEffect.of({ from, to }));
    }
  });
  view.dispatch({ selection: { anchor: range.from }, effects });
}

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

/**
 * Returns the extension that keeps the editor focused while its scrollbars are pressed. Chromium otherwise moves focus
 * off the editor, which closes popups and clears highlights that go when it blurs.
 */
export function scrollbarsKeepFocus(): Extension {
  return ViewPlugin.fromClass(
    class {
      constructor(private readonly view: EditorView) {
        view.scrollDOM.addEventListener('mousedown', this.press);
      }

      destroy() {
        this.view.scrollDOM.removeEventListener('mousedown', this.press);
      }

      // Prevents the default of a press on a scrollbar, which is the part of the scroller outside its client box. The
      // scrollbar still scrolls, since the browser drives it before the event.
      private readonly press = (event: MouseEvent) => {
        const { scrollDOM } = this.view;
        if (
          event.target === scrollDOM &&
          (event.offsetX >= scrollDOM.clientWidth || event.offsetY >= scrollDOM.clientHeight)
        ) {
          event.preventDefault();
        }
      };
    },
  );
}
