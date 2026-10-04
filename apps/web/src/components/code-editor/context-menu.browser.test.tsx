import { history } from '@codemirror/commands';
import { foldedRanges, foldGutter, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { beforeAll, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { EditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu';

const DOC = 'fn main() {\n    let a = 1;\n}\n';

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

function mount(): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView>(null);
    useEffect(() => {
      view.current = new EditorView({
        state: EditorState.create({ doc: DOC, extensions: [history(), foldGutter(), rightClickContextMenu, rust] }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view.current);
      return () => view.current?.destroy();
    }, []);
    return (
      <EditorContextMenu view={view}>
        <div ref={host} />
      </EditorContextMenu>
    );
  }
  render(<Probe />);
  return ready;
}

// The accessible name carries the shortcut too.
const item = (name: string) => page.getByRole('menuitem', { name: new RegExp(`^${name}`) });

async function open(view: EditorView, pos: number): Promise<void> {
  const rect = view.coordsAtPos(pos);
  if (rect === null) {
    throw new Error('offscreen');
  }
  const content = view.contentDOM.getBoundingClientRect();
  await userEvent.click(view.contentDOM, {
    button: 'right',
    position: { x: rect.left - content.left + 1, y: rect.top - content.top + 1 },
  });
  await expect.element(item('Paste')).toBeVisible();
}

test('right-click outside the selection moves the caret, inside keeps it', async () => {
  const view = await mount();
  const second = view.state.doc.line(2);

  await open(view, second.from + 8);
  expect(view.state.selection.main.head).toBe(second.from + 8);
  await userEvent.keyboard('{Escape}');

  view.dispatch({ selection: { anchor: second.from, head: second.to } });
  await open(view, second.from + 8);
  expect(view.state.selection.main.from).toBe(second.from);
  expect(view.state.selection.main.to).toBe(second.to);
});

test('cut and copy only with a selection', async () => {
  const view = await mount();
  await open(view, 0);
  expect(item('Cut').query()).toBeNull();
  expect(item('Copy').query()).toBeNull();
  await userEvent.keyboard('{Escape}');

  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  view.dispatch({ selection: { anchor: 0, head: 2 } });
  await open(view, 1);
  await userEvent.click(item('Copy'));
  expect(write).toHaveBeenLastCalledWith('fn');
  expect(view.state.doc.toString()).toBe(DOC);

  await open(view, 1);
  await userEvent.click(item('Cut'));
  expect(write).toHaveBeenLastCalledWith('fn');
  await expect.poll(() => view.state.doc.toString()).toBe(DOC.slice(2));
});

test('paste and select all', async () => {
  const view = await mount();
  vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('// ');
  await open(view, 0);
  await userEvent.click(item('Paste'));
  await expect.poll(() => view.state.doc.toString()).toBe(`// ${DOC}`);
  expect(view.hasFocus).toBe(true);

  await open(view, 0);
  await userEvent.click(item('Select all'));
  expect(view.state.selection.main.to).toBe(view.state.doc.length);
});

test('toggle comment, fold and unfold act on the caret line', async () => {
  const view = await mount();
  const second = view.state.doc.line(2);

  await open(view, second.from + 8);
  await userEvent.click(item('Toggle comment'));
  expect(view.state.doc.line(2).text).toBe('    // let a = 1;');

  await open(view, 0);
  await userEvent.click(item('Fold'));
  expect(foldedRanges(view.state).size).toBe(1);

  await open(view, 0);
  await userEvent.click(item('Unfold'));
  expect(foldedRanges(view.state).size).toBe(0);
});
