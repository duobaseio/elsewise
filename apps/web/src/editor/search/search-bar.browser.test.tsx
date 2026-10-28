import { standardKeymap } from '@codemirror/commands';
import { openSearchPanel, searchPanelOpen } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { DEFAULT_COMMANDS } from '@elsewise/plugin';
import { useEffect, useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CommandManagerContext } from '@/command/command-manager';
import { diagnostics } from '@/editor/diagnostics';
import { scrollbarMarkers } from '@/editor/scrollbar-markers/scrollbar-markers';
import { useSearchExtension } from '@/editor/search/search-bar';
import { builtInCommands, commandsExtension } from '../../../test/commands';

const DOC = 'let a = 1;\nlet b = 2;\nLet c = 3;\nletter\n';

function mount(extensions: Extension[] = [], commands = builtInCommands()): Promise<EditorView> {
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
          extensions: [search, commandsExtension(commands), keymap.of(standardKeymap), ...extensions],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(created);
      return () => created.destroy();
    }, [search]);
    return (
      <CommandManagerContext value={commands}>
        <div ref={host} />
        {portal}
      </CommandManagerContext>
    );
  }
  render(<Probe />);
  return ready;
}

const find = () => page.getByRole('textbox', { name: 'Find' });

const count = () => page.getByRole('status');

const selected = (view: EditorView) =>
  view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);

describe('SearchBar', () => {
  test('opens on Mod-f, seeded from selection', async () => {
    const view = await mount();
    view.dispatch({ selection: { anchor: 4, head: 5 } });
    view.focus();
    await userEvent.keyboard('{Meta>}f{/Meta}');

    await expect.element(find()).toHaveValue('a');
    await expect.element(find()).toHaveFocus();
    await expect.element(find()).toHaveSelection('a');
  });

  test('reseeds on Mod-f while open', async () => {
    const view = await mount();
    openSearchPanel(view);
    await userEvent.fill(find(), 'stale');

    view.dispatch({ selection: { anchor: 15, head: 16 } });
    view.focus();
    await userEvent.keyboard('{Meta>}f{/Meta}');

    await expect.element(find()).toHaveValue('b');
    await expect.element(find()).toHaveFocus();
    await expect.element(find()).toHaveSelection('b');
  });

  test('counts matches live, stepping on Enter', async () => {
    const view = await mount();
    openSearchPanel(view);
    await userEvent.fill(find(), 'let');

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

  test('marks matches on scrollbar while open', async () => {
    const view = await mount([diagnostics, scrollbarMarkers()]);
    openSearchPanel(view);
    await userEvent.fill(find(), 'let');

    await vi.waitFor(() => expect(view.dom.querySelectorAll('.cm-scrollbar-marker-searchMatch')).toHaveLength(4));

    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(view.dom.querySelectorAll('.cm-scrollbar-marker-searchMatch')).toHaveLength(0));
  });

  test('selects first match from cursor on typing, wrapping', async () => {
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

  test('centers off-screen match', async () => {
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

  test('narrows by case and word, flagging invalid regexp', async () => {
    const view = await mount();
    openSearchPanel(view);
    await userEvent.fill(find(), 'let');

    await userEvent.click(page.getByRole('button', { name: 'Match case' }));
    await expect.element(count()).toHaveTextContent('1/3');

    await userEvent.click(page.getByRole('button', { name: 'Whole word' }));
    await expect.element(count()).toHaveTextContent('1/2');

    await userEvent.click(page.getByRole('button', { name: 'Regex' }));
    await userEvent.fill(find(), '[');
    await expect.element(find()).toHaveAttribute('aria-invalid', 'true');
    await expect.element(count()).toHaveTextContent('');

    await userEvent.fill(find(), 'nothing');
    await expect.element(count()).toHaveTextContent('No results');
  });

  test('replaces match, then all', async () => {
    const view = await mount();
    view.focus();
    await userEvent.keyboard('{Meta>}r{/Meta}');
    await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
    await expect.element(page.getByRole('textbox', { name: 'Replace' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));

    await userEvent.fill(find(), 'let ');
    await userEvent.fill(page.getByRole('textbox', { name: 'Replace' }), 'const ');
    // Typing the replacement leaves the selected match alone.
    expect(view.state.selection.main.from).toBe(0);
    expect(selected(view)).toBe('let ');
    await userEvent.click(page.getByRole('button', { name: 'Replace', exact: true }));
    expect(view.state.doc.line(1).text).toBe('const a = 1;');
    expect(view.state.selection.main.from).toBe(view.state.doc.line(2).from);

    await userEvent.click(page.getByRole('button', { name: 'Replace all' }));
    expect(view.state.doc.toString()).toBe('const a = 1;\nconst b = 2;\nconst c = 3;\nletter\n');
  });

  test('hides replace row on Mod-f', async () => {
    const view = await mount();
    const replace = () => page.getByRole('textbox', { name: 'Replace' });
    view.focus();
    await userEvent.keyboard('{Meta>}r{/Meta}');
    await expect.element(replace()).toBeVisible();

    await userEvent.keyboard('{Meta>}f{/Meta}');
    await expect.element(replace()).not.toBeInTheDocument();

    await userEvent.keyboard('{Meta>}r{/Meta}');
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Meta>}f{/Meta}');
    await expect.element(find()).toBeVisible();
    await expect.element(replace()).not.toBeInTheDocument();
  });

  test('runs search commands from field', async () => {
    const view = await mount();
    openSearchPanel(view);
    await userEvent.fill(find(), 'let');

    await userEvent.keyboard('{Meta>}g{/Meta}');
    await expect.element(count()).toHaveTextContent('2/4');
    await userEvent.keyboard('{Meta>}{Shift>}g{/Shift}{/Meta}');
    await expect.element(count()).toHaveTextContent('1/4');

    await userEvent.keyboard('{Meta>}r{/Meta}');
    await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();
  });

  test('shows selected keymap key on toggle replace', async () => {
    const commands = builtInCommands();
    const view = await mount([], commands);
    openSearchPanel(view);
    commands.selected = { name: 'Test', keys: { [DEFAULT_COMMANDS.editor.search.replace]: ['Mod-e'] } };

    await userEvent.hover(page.getByRole('button', { name: 'Toggle replace' }));
    await expect.element(page.getByText('⌘E'), { timeout: 2000 }).toBeVisible();
  });

  test('replaces on Enter in replace field', async () => {
    const view = await mount();
    openSearchPanel(view);
    await userEvent.fill(find(), 'let ');
    expect(selected(view)).toBe('let ');

    await userEvent.click(page.getByRole('button', { name: 'Toggle replace' }));
    await userEvent.fill(page.getByRole('textbox', { name: 'Replace' }), 'const ');
    await userEvent.keyboard('{Enter}');
    expect(view.state.doc.line(1).text).toBe('const a = 1;');
  });

  test('closes on Escape, refocusing editor', async () => {
    const view = await mount();
    openSearchPanel(view);
    await expect.element(find()).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await expect.element(find()).not.toBeInTheDocument();
    expect(searchPanelOpen(view.state)).toBe(false);
    expect(view.hasFocus).toBe(true);
  });

  test('hides replace in read-only document', async () => {
    const view = await mount([EditorState.readOnly.of(true)]);
    openSearchPanel(view);
    await expect.element(find()).toBeVisible();
    expect(page.getByRole('button', { name: 'Toggle replace' }).elements()).toHaveLength(0);
  });

  test('grows fields with text, within bar', async () => {
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

  test('labels in sentence case', async () => {
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
});
