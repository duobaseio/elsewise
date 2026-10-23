import { EditorSelection, EditorState } from '@codemirror/state';
import { drawSelection, EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { drawActiveLine } from '@/editor/active-line';

let view: EditorView;

// Mounts `doc` with the active line, and waits for the layers to be measured.
async function mount(doc: string) {
  const host = document.body.appendChild(document.createElement('div'));
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [EditorState.allowMultipleSelections.of(true), drawSelection(), drawActiveLine()],
    }),
    parent: host,
  });
  await new Promise(requestAnimationFrame);
}

afterEach(() => {
  view.dom.parentElement?.remove();
  view.destroy();
});

// Returns the rectangles of the active lines, relative to the content.
function active(): { top: number; width: number }[] {
  const content = view.contentDOM.getBoundingClientRect();
  return [...view.dom.querySelectorAll('.cm-activeLine')].map((marker) => {
    const rect = marker.getBoundingClientRect();
    return { top: rect.top - content.top, width: rect.width };
  });
}

// Returns the rectangle of the `n`th line, from 1, relative to the content.
function line(n: number): { top: number; width: number } {
  const content = view.contentDOM.getBoundingClientRect();
  const rect = (view.contentDOM.querySelectorAll('.cm-line')[n - 1] as Element).getBoundingClientRect();
  return { top: rect.top - content.top, width: rect.width };
}

describe('drawActiveLine', () => {
  test('covers line of each cursor', async () => {
    await mount('one\ntwo\nthree');
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(8)]) });
    await new Promise(requestAnimationFrame);

    expect(active()).toEqual([line(1), line(3)]);
  });

  test('covers line once for several cursors', async () => {
    await mount('one\ntwo');
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)]) });
    await new Promise(requestAnimationFrame);

    expect(active()).toEqual([line(1)]);
  });
});
