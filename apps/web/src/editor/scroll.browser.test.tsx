import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { scroll, scrollbarsKeepFocus } from '@/editor/scroll';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` in an editor 200px high, with `extensions`.
function open(extensions: Extension = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [EditorView.theme({ '&': { height: '200px' } }), extensions] }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Returns the range of `text` in `DOC`.
function range(text: string) {
  const from = DOC.indexOf(text);
  return EditorSelection.range(from, from + text.length);
}

// Returns how far `pos` is from the middle of `view`, in pixels.
function offCenter(view: EditorView, pos: number): number {
  const bounds = view.scrollDOM.getBoundingClientRect();
  const coords = view.coordsAtPos(pos);
  if (coords === null) {
    throw new Error('not drawn');
  }
  return Math.abs((coords.top + coords.bottom) / 2 - (bounds.top + bounds.height / 2));
}

describe('scroll', () => {
  test('centers range below editor', () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('centers range above editor', () => {
    const view = open();
    view.dispatch({ effects: EditorView.scrollIntoView(DOC.length) });

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('centers range cut off at bottom', () => {
    const view = open();
    const bounds = view.scrollDOM.getBoundingClientRect();
    const cut = view.lineBlockAtHeight(bounds.height - 4);

    view.dispatch({ effects: scroll(EditorSelection.range(cut.from, cut.to), view) });

    expect(offCenter(view, cut.from)).toBeLessThan(10);
  });

  test("doesn't scroll visible range", () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 3'), view) });

    expect(view.scrollDOM.scrollTop).toBe(0);
  });
});

describe('scrollbarsKeepFocus', () => {
  // Presses `view`'s scroller at `x` and `y` from its top left, and returns whether the press kept its default.
  function press(view: EditorView, x: number, y: number): boolean {
    const { left, top } = view.scrollDOM.getBoundingClientRect();
    return view.scrollDOM.dispatchEvent(
      new MouseEvent('mousedown', { clientX: left + x, clientY: top + y, bubbles: true, cancelable: true }),
    );
  }

  test('prevents press on vertical scrollbar', () => {
    const view = open(scrollbarsKeepFocus());
    const { scrollDOM } = view;

    expect(press(view, scrollDOM.clientWidth, 10)).toBe(false);
  });

  test('prevents press on horizontal scrollbar', () => {
    const view = open(scrollbarsKeepFocus());
    const { scrollDOM } = view;

    expect(press(view, 10, scrollDOM.clientHeight)).toBe(false);
  });

  test('lets press on scroller through', () => {
    const view = open(scrollbarsKeepFocus());

    expect(press(view, 10, 10)).toBe(true);
  });
});
