import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { selectionMatches } from '@/editor/stripe/selection-matches';
import { stripe } from '@/editor/stripe/stripe';
import { METRICS } from '@/editor/theme';

const DOC = 'let total = 1;\ntotal + 2;\nlet other = total;\n// total\n';

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

// Opens `doc` in an editor 400px high with the stripe.
function open(doc = DOC): EditorView {
  const host = document.body.appendChild(document.createElement('div'));
  host.style.height = '400px';
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [selectionMatches(), stripe(), METRICS, EditorState.allowMultipleSelections.of(true)],
    }),
    parent: host,
  });
  views.push(view);
  return view;
}

// Selects the first `text` in `view`.
function select(view: EditorView, text: string): void {
  const anchor = view.state.doc.toString().indexOf(text);
  view.dispatch({ selection: { anchor, head: anchor + text.length } });
}

const marked = (view: EditorView) => view.dom.querySelectorAll('.cm-stripe-mark-usage').length;

describe('selectionMatches', () => {
  test('marks other occurrences of selection, until it is cleared', async () => {
    const view = open();

    select(view, 'total');
    // Three others, each on its own line.
    await vi.waitFor(() => expect(marked(view)).toBe(3));

    view.dispatch({ selection: { anchor: 0 } });
    await vi.waitFor(() => expect(marked(view)).toBe(0));
  });

  test('marks nothing for several selections', async () => {
    const view = open();
    select(view, 'total');
    await vi.waitFor(() => expect(marked(view)).toBe(3));

    const first = DOC.indexOf('total');
    const second = DOC.indexOf('other');
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(first, first + 'total'.length),
        EditorSelection.range(second, second + 'other'.length),
      ]),
    });

    await vi.waitFor(() => expect(marked(view)).toBe(0));
  });

  test('marks nothing in long document', async () => {
    const view = open(`total\n${'line\n'.repeat(10_000)}total`);

    select(view, 'total');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(marked(view)).toBe(0);
  });

  test('marks nothing for long selection or too many matches', async () => {
    const view = open(`${'x '.repeat(150)}\n${'x '.repeat(150)}`);

    select(view, 'x '.repeat(101));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(marked(view)).toBe(0);

    select(view, 'x');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(marked(view)).toBe(0);
  });
});
