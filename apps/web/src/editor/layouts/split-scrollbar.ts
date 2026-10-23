import type { Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

// TODO: LLM Generated, verify this.

/**
 * The least height of the thumb, in pixels, so that it stays easy to grab in a long document.
 */
const THUMB_MIN_HEIGHT = 20;

/**
 * Returns the extension that draws the vertical scrollbar itself, over the native one, whose thumb has to be hidden. The
 * native track keeps the code clear of it. Dragging its thumb scrolls from code, so that what follows the scroll, e.g.
 * the other side of a split, moves in the same frame.
 */
export function splitScrollbar(): Extension {
  return painter;
}

interface Layout {
  readonly top: number;
  readonly height: number;
  readonly scrollHeight: number;
}

const painter = ViewPlugin.fromClass(
  class {
    readonly dom: HTMLElement;
    readonly thumb: HTMLElement;
    private layout: Layout = { top: 0, height: 0, scrollHeight: 0 };
    /**
     * Where the pointer grabbed the thumb, and the scroll then.
     */
    private grabbed: { readonly y: number; readonly scrollTop: number } | null = null;
    private readonly measure: { read: () => Layout; write: (layout: Layout) => void };

    constructor(private readonly view: EditorView) {
      // Right after the scroller, so that what is drawn over the scrollbar later, e.g. the stripe, stays on top.
      this.dom = view.dom.insertBefore(document.createElement('div'), view.scrollDOM.nextSibling);
      this.dom.className = 'cm-scrollbar';
      this.thumb = this.dom.appendChild(document.createElement('div'));
      this.thumb.className = 'cm-scrollbar-thumb';
      this.dom.addEventListener('pointerdown', this.down);
      view.scrollDOM.addEventListener('scroll', this.place);
      this.measure = {
        read: () => ({
          top: view.scrollDOM.offsetTop,
          height: view.scrollDOM.clientHeight,
          scrollHeight: view.scrollDOM.scrollHeight,
        }),
        write: (layout) => this.draw(layout),
      };
      view.requestMeasure(this.measure);
    }

    update(update: ViewUpdate) {
      if (update.geometryChanged || update.heightChanged || update.viewportChanged) {
        update.view.requestMeasure(this.measure);
      }
    }

    destroy() {
      this.up();
      this.view.scrollDOM.removeEventListener('scroll', this.place);
      this.dom.remove();
    }

    private draw(layout: Layout) {
      this.layout = layout;
      this.dom.style.top = `${layout.top}px`;
      this.dom.style.height = `${layout.height}px`;
      this.dom.hidden = layout.scrollHeight <= layout.height;
      this.thumb.style.height = `${this.thumbHeight()}px`;
      this.place();
    }

    private thumbHeight(): number {
      const { height, scrollHeight } = this.layout;
      return scrollHeight > 0 ? Math.max(THUMB_MIN_HEIGHT, (height * height) / scrollHeight) : 0;
    }

    // Moves the thumb to the scroll, as soon as it changes.
    private readonly place = () => {
      const { height, scrollHeight } = this.layout;
      const range = scrollHeight - height;
      const room = height - this.thumbHeight();
      this.thumb.style.top = `${range > 0 ? (this.view.scrollDOM.scrollTop / range) * room : 0}px`;
    };

    // Grabs the thumb, or pages towards the pointer from the track.
    private readonly down = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      // Keeps the focus in the code.
      event.preventDefault();
      const { scrollDOM } = this.view;
      if (event.target === this.thumb) {
        this.grabbed = { y: event.clientY, scrollTop: scrollDOM.scrollTop };
        this.thumb.dataset.active = '';
        window.addEventListener('pointermove', this.move);
        window.addEventListener('pointerup', this.up);
        return;
      }

      const above = event.clientY < this.thumb.getBoundingClientRect().top;
      scrollDOM.scrollTop += above ? -scrollDOM.clientHeight : scrollDOM.clientHeight;
    };

    private readonly move = (event: PointerEvent) => {
      if (this.grabbed === null) {
        return;
      }

      const { height, scrollHeight } = this.layout;
      const room = height - this.thumbHeight();
      if (room > 0) {
        this.view.scrollDOM.scrollTop =
          this.grabbed.scrollTop + ((event.clientY - this.grabbed.y) / room) * (scrollHeight - height);
      }
    };

    private readonly up = () => {
      this.grabbed = null;
      delete this.thumb.dataset.active;
      window.removeEventListener('pointermove', this.move);
      window.removeEventListener('pointerup', this.up);
    };
  },
);
