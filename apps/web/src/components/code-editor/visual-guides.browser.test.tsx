import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { visualGuides } from '@/components/code-editor/visual-guides';

const GUIDES = new Compartment();

let view: EditorView;

beforeEach(async () => {
  const host = document.body.appendChild(document.createElement('div'));
  host.style.fontFamily = 'monospace';
  view = new EditorView({
    state: EditorState.create({
      doc: 'fn main() {}\n'.repeat(3),
      extensions: [lineNumbers(), GUIDES.of(visualGuides([40, 80]))],
    }),
    parent: host,
  });
  // The layer measures its markers in the next measure cycle.
  await new Promise(requestAnimationFrame);
});

afterEach(() => {
  view.dom.parentElement?.remove();
  view.destroy();
});

function guides(): HTMLElement[] {
  return [...view.scrollDOM.querySelectorAll<HTMLElement>('.cm-visual-guide')];
}

function expectedLeft(column: number): number {
  const line = view.contentDOM.querySelector('.cm-line');
  if (line === null) {
    throw new Error('no line');
  }
  return Number.parseFloat(getComputedStyle(line).paddingLeft) + column * view.defaultCharacterWidth;
}

test("draws one guide per column at the column's x", () => {
  const content = view.contentDOM.getBoundingClientRect().left;
  const lefts = guides().map((guide) => guide.getBoundingClientRect().left - content);
  expect(lefts).toHaveLength(2);
  expect(lefts[0]).toBeCloseTo(expectedLeft(40), 0);
  expect(lefts[1]).toBeCloseTo(expectedLeft(80), 0);
});

test('reconfiguring replaces the set', async () => {
  view.dispatch({ effects: GUIDES.reconfigure(visualGuides([])) });
  await new Promise(requestAnimationFrame);
  expect(guides()).toHaveLength(0);

  view.dispatch({ effects: GUIDES.reconfigure(visualGuides([100])) });
  await new Promise(requestAnimationFrame);
  expect(guides()).toHaveLength(1);
});

test('the guide spans the content height', () => {
  expect(guides()[0].getBoundingClientRect().height).toBeGreaterThanOrEqual(view.contentHeight);
});
