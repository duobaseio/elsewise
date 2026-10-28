import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { visualGuides } from '@/editor/visual-guides';

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

describe('visualGuides', () => {
  test('draws guide at each column', () => {
    const line = view.contentDOM.querySelector('.cm-line');
    if (line === null) {
      throw new Error('no line');
    }
    const padding = Number.parseFloat(getComputedStyle(line).paddingLeft);
    const content = view.contentDOM.getBoundingClientRect().left;
    const lefts = guides().map((guide) => guide.getBoundingClientRect().left - content);
    expect(lefts).toHaveLength(2);
    expect(lefts[0]).toBeCloseTo(padding + 40 * view.defaultCharacterWidth, 0);
    expect(lefts[1]).toBeCloseTo(padding + 80 * view.defaultCharacterWidth, 0);
  });

  test('replaces guides on reconfigure', async () => {
    view.dispatch({ effects: GUIDES.reconfigure(visualGuides([])) });
    await new Promise(requestAnimationFrame);
    expect(guides()).toHaveLength(0);

    view.dispatch({ effects: GUIDES.reconfigure(visualGuides([100])) });
    await new Promise(requestAnimationFrame);
    expect(guides()).toHaveLength(1);
  });

  test('spans content height', () => {
    expect(guides()[0].getBoundingClientRect().height).toBeGreaterThanOrEqual(view.contentHeight);
  });

  test('spans scroller as horizontal scrollbar appears', async () => {
    view.dom.style.height = '200px';
    view.dom.style.width = `${120 * view.defaultCharacterWidth}px`;
    // Redraws the guides at the new height.
    view.dispatch({ effects: GUIDES.reconfigure(visualGuides([40, 80])) });
    const scroller = view.scrollDOM;
    await expect.poll(() => guides()[0].offsetHeight).toBe(scroller.clientHeight);

    // Narrower than the guides, before the layer's next measure cycle.
    view.dom.style.width = `${20 * view.defaultCharacterWidth}px`;

    expect(scroller.offsetHeight - scroller.clientHeight).toBeGreaterThan(0);
    expect(scroller.scrollHeight).toBe(scroller.clientHeight);
    expect(guides()[0].offsetHeight).toBe(scroller.clientHeight);
  });
});
