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

/**
 * Returns the extension that keeps the editor's scroll position when it is taken out of the document and put back,
 * e.g. as its tab is switched from and back to. The browser otherwise drops the position.
 */
// Disclaimer: This effect is AI generated and has not been thoroughly reviewed.
export function scrollKeepsPosition(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly sentinel: HTMLElement;
      private readonly resized: ResizeObserver;
      private position: { readonly top: number; readonly left: number } | null = null;
      private pending = false;

      constructor(private readonly view: EditorView) {
        // Only a custom element is told when it enters the document.
        if (customElements.get('elsewise-attach-sentinel') === undefined) {
          customElements.define(
            'elsewise-attach-sentinel',
            class extends HTMLElement {
              connectedCallback() {
                this.dispatchEvent(new Event('connect'));
              }
            },
          );
        }

        this.sentinel = document.createElement('elsewise-attach-sentinel');
        this.sentinel.hidden = true;
        this.sentinel.addEventListener('connect', this.restore);
        view.dom.append(this.sentinel);
        view.scrollDOM.addEventListener('scroll', this.record);
        // The position cannot be restored until the editor is laid out.
        this.resized = new ResizeObserver(() => {
          if (this.pending) {
            this.restore();
          }
        });
        this.resized.observe(view.scrollDOM);
      }

      destroy() {
        this.resized.disconnect();
        this.view.scrollDOM.removeEventListener('scroll', this.record);
        this.sentinel.remove();
      }

      private readonly record = () => {
        const { scrollDOM } = this.view;
        if (scrollDOM.isConnected && !this.pending) {
          this.position = { top: scrollDOM.scrollTop, left: scrollDOM.scrollLeft };
        }
      };

      private readonly restore = () => {
        const { scrollDOM } = this.view;
        if (this.position === null) {
          return;
        }

        this.pending = scrollDOM.clientHeight === 0;
        if (!this.pending) {
          scrollDOM.scrollTop = this.position.top;
          scrollDOM.scrollLeft = this.position.left;
        }
      };
    },
  );
}
