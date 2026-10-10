import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { scroll } from '@/components/code-editor/scroll';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` in an editor 200px high.
function open(): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: EditorView.theme({ '&': { height: '200px' } }) }),
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
  test('scrolls a range below the editor to its middle', () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('scrolls a range above the editor to its middle', () => {
    const view = open();
    view.dispatch({ effects: EditorView.scrollIntoView(DOC.length) });

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('scrolls a range cut off by the bottom of the editor to its middle', () => {
    const view = open();
    const bounds = view.scrollDOM.getBoundingClientRect();
    const cut = view.lineBlockAtHeight(bounds.height - 4);

    view.dispatch({ effects: scroll(EditorSelection.range(cut.from, cut.to), view) });

    expect(offCenter(view, cut.from)).toBeLessThan(10);
  });

  test("doesn't scroll a visible range", () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 3'), view) });

    expect(view.scrollDOM.scrollTop).toBe(0);
  });
});
