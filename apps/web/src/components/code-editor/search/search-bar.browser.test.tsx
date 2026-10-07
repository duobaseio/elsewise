import { defaultKeymap } from '@codemirror/commands';
import { getSearchQuery, openSearchPanel, searchKeymap, searchPanelOpen } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useSearchExtension } from '@/components/code-editor/search/search-bar';
import { replaceRow } from '@/components/code-editor/search/search-bar-query';

const DOC = 'let a = 1;\nlet b = 2;\nLet c = 3;\nletter\n';

let view: EditorView | null = null;

afterEach(() => {
  view = null;
});

function mount(extensions: Extension[] = []): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const { search, portal } = useSearchExtension();
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const created = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [search, keymap.of([...defaultKeymap, ...searchKeymap]), ...extensions],
        }),
        parent: host.current as HTMLDivElement,
      });
      view = created;
      resolve(created);
      return () => created.destroy();
    }, [search]);
    return (
      <>
        <div ref={host} />
        {portal}
      </>
    );
  }
  render(<Probe />);
  return ready;
}

const find = () => page.getByRole('textbox', { name: 'Find' });
const count = () => page.getByRole('status');
const selected = () =>
  (view as EditorView).state.sliceDoc(view?.state.selection.main.from, view?.state.selection.main.to);

test('Mod-f opens seeded from the selection', async () => {
  const view = await mount();
  view.dispatch({ selection: { anchor: 4, head: 5 } });
  view.focus();
  await userEvent.keyboard('{Meta>}f{/Meta}');

  await expect.element(find()).toHaveValue('a');
  await expect.element(find()).toHaveFocus();
  const input = find().element() as HTMLInputElement;
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 1]);
});

test('Mod-f while open re-seeds', async () => {
  const view = await mount();
  openSearchPanel(view);
  await userEvent.fill(find(), 'stale');

  view.dispatch({ selection: { anchor: 15, head: 16 } });
  view.focus();
  await userEvent.keyboard('{Meta>}f{/Meta}');

  await expect.element(find()).toHaveValue('b');
  await expect.element(find()).toHaveFocus();
  const input = find().element() as HTMLInputElement;
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 1]);
});

test('live search, Enter walks matches', async () => {
  const view = await mount();
  openSearchPanel(view);
  await userEvent.fill(find(), 'let');

  expect(getSearchQuery(view.state).search).toBe('let');
  await expect.element(count()).toHaveTextContent('1/4');
  expect(view.dom.querySelectorAll('.cm-searchMatch')).toHaveLength(4);

  await userEvent.keyboard('{Enter}');
  await expect.element(count()).toHaveTextContent('2/4');
  await userEvent.keyboard('{Enter}');
  await expect.element(count()).toHaveTextContent('3/4');
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  await expect.element(count()).toHaveTextContent('2/4');
  expect(view.state.selection.main.from).toBe(view.state.doc.line(2).from);
});

test('typing selects the first match from the cursor on', async () => {
  const view = await mount();
  view.dispatch({ selection: { anchor: view.state.doc.line(2).to } });
  openSearchPanel(view);

  await userEvent.fill(find(), 'let');
  await expect.element(count()).toHaveTextContent('3/4');
  expect(view.state.selection.main.from).toBe(view.state.doc.line(3).from);

  await userEvent.fill(find(), 'lett');
  await expect.element(count()).toHaveTextContent('1/1');
  expect(view.state.selection.main.from).toBe(view.state.doc.line(4).from);

  // Wraps around.
  await userEvent.fill(find(), 'a = ');
  await expect.element(count()).toHaveTextContent('1/1');
  expect(view.state.selection.main.from).toBe(4);

  await userEvent.fill(find(), 'nothing');
  await expect.element(count()).toHaveTextContent('No results');
  expect(view.state.selection.main.from).toBe(4);
});

test('centers a match that is out of view', async () => {
  const view = await mount([EditorView.theme({ '&': { height: '200px' }, '.cm-scroller': { overflow: 'auto' } })]);
  view.dispatch({ changes: { from: 0, insert: '\n'.repeat(100) }, selection: { anchor: 0 } });
  openSearchPanel(view);
  const middle = () => {
    const bounds = view.scrollDOM.getBoundingClientRect();
    const match = view.coordsAtPos(view.state.selection.main.from) as DOMRect;
    return Math.abs((match.top + match.bottom) / 2 - (bounds.top + bounds.bottom) / 2);
  };

  await userEvent.fill(find(), 'let b');
  await expect.poll(middle).toBeLessThan(20);

  // A match in view stays put.
  const top = view.scrollDOM.scrollTop;
  await userEvent.fill(find(), 'let a');
  await expect.poll(() => view.state.selection.main.from).toBe(view.state.doc.line(101).from);
  expect(view.scrollDOM.scrollTop).toBe(top);
});

test('toggles and invalid regexp', async () => {
  const view = await mount();
  openSearchPanel(view);
  await userEvent.fill(find(), 'let');

  await userEvent.click(page.getByRole('button', { name: 'Match case' }));
  expect(getSearchQuery(view.state).caseSensitive).toBe(true);
  await expect.element(count()).toHaveTextContent('1/3');

  await userEvent.click(page.getByRole('button', { name: 'Whole word' }));
  expect(getSearchQuery(view.state).wholeWord).toBe(true);
  await expect.element(count()).toHaveTextContent('1/2');

  await userEvent.click(page.getByRole('button', { name: 'Regex' }));
  expect(getSearchQuery(view.state).regexp).toBe(true);
  await userEvent.fill(find(), '[');
  await expect.element(find()).toHaveAttribute('aria-invalid', 'true');
  await expect.element(count()).toHaveTextContent('');

  await userEvent.fill(find(), 'nothing');
  await expect.element(count()).toHaveTextContent('No results');
});

test('replace row', async () => {
  const view = await mount();
  view.focus();
  await userEvent.keyboard('{Meta>}{Alt>}f{/Alt}{/Meta}');
  await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();
  expect(view.state.field(replaceRow)).toBe(true);

  await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
  await expect.element(page.getByRole('textbox', { name: 'Replace' })).not.toBeInTheDocument();
  await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));

  await userEvent.fill(find(), 'let ');
  await userEvent.fill(page.getByRole('textbox', { name: 'Replace' }), 'const ');
  // Typing the replacement leaves the selected match alone.
  expect(view.state.selection.main.from).toBe(0);
  expect(selected()).toBe('let ');
  await userEvent.click(page.getByRole('button', { name: 'Replace', exact: true }));
  expect(view.state.doc.line(1).text).toBe('const a = 1;');
  expect(view.state.selection.main.from).toBe(view.state.doc.line(2).from);

  await userEvent.click(page.getByRole('button', { name: 'Replace all' }));
  expect(view.state.doc.toString()).toBe('const a = 1;\nconst b = 2;\nconst c = 3;\nletter\n');
});

test('Enter in replace field', async () => {
  const view = await mount();
  openSearchPanel(view);
  await userEvent.fill(find(), 'let ');
  expect(selected()).toBe('let ');

  await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
  await userEvent.fill(page.getByRole('textbox', { name: 'Replace' }), 'const ');
  await userEvent.keyboard('{Enter}');
  expect(view.state.doc.line(1).text).toBe('const a = 1;');
});

test('Escape closes and refocuses editor', async () => {
  const view = await mount();
  openSearchPanel(view);
  await expect.element(find()).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  await expect.element(find()).not.toBeInTheDocument();
  expect(searchPanelOpen(view.state)).toBe(false);
  expect(view.hasFocus).toBe(true);
});

test('read-only hides replace', async () => {
  const view = await mount([EditorState.readOnly.of(true)]);
  openSearchPanel(view);
  await expect.element(find()).toBeVisible();
  expect(page.getByRole('button', { name: 'Toggle replace' }).elements()).toHaveLength(0);
});

test('field width follows its text', async () => {
  const view = await mount();
  view.dom.parentElement?.style.setProperty('width', '800px');
  openSearchPanel(view);
  const width = () => find().element().getBoundingClientRect().width;
  const bar = () => (find().element().closest('search') as HTMLElement).getBoundingClientRect();
  const close = () => page.getByRole('button', { name: 'Close' }).element().getBoundingClientRect();

  await userEvent.fill(find(), 'short');
  expect(width()).toBe(320);
  const rest = width();

  await userEvent.fill(find(), 'x'.repeat(50));
  expect(width()).toBeGreaterThan(rest);
  expect(close().right).toBeLessThanOrEqual(bar().right);

  await userEvent.fill(find(), 'x'.repeat(400));
  expect(close().right).toBeLessThanOrEqual(bar().right);
  expect(find().element().getBoundingClientRect().right).toBeLessThan(close().left);

  await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
  expect(page.getByRole('textbox', { name: 'Replace' }).element().getBoundingClientRect().width).toBe(width());
});

test('every label in the bar is sentence case', async () => {
  const view = await mount();
  openSearchPanel(view);
  await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
  await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();

  const bar = document.querySelector('search') as HTMLElement;
  const labels = [
    ...[...bar.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label')),
    ...[...bar.querySelectorAll('[placeholder]')].map((node) => node.getAttribute('placeholder')),
    ...[...bar.querySelectorAll('button:not([aria-label])')].map((node) => node.textContent),
  ];
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label).toMatch(/^[A-Z][^A-Z]*$/);
  }
});
