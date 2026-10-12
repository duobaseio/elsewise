import { history } from '@codemirror/commands';
import { foldGutter, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_EDITOR_CONTEXT_MENU } from '@elsewise/plugin';
import { useEffect, useRef } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CodeEditorContextMenu, rightClickContextMenu } from '@/components/code-editor/context-menu/context-menu';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';

const DOC = 'fn main() {\n    let a = 1;\n}\n';

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

function mount(editor = new EditorManager()): Promise<EditorView> {
  let resolve!: (view: EditorView) => void;
  const ready = new Promise<EditorView>((r) => {
    resolve = r;
  });
  function Probe() {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView>(null);
    useEffect(() => {
      view.current = new EditorView({
        state: EditorState.create({
          doc: DOC,
          extensions: [history(), foldGutter(), rightClickContextMenu, rust],
        }),
        parent: host.current as HTMLDivElement,
      });
      resolve(view.current);
      return () => view.current?.destroy();
    }, []);
    return (
      <EditorManagerContext value={editor}>
        <CodeEditorContextMenu view={view}>
          <div ref={host} />
        </CodeEditorContextMenu>
      </EditorManagerContext>
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

describe('rightClickContextMenu', () => {
  test('moves caret to right-click outside selection, and keeps it inside', async () => {
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
});

describe('CodeEditorContextMenu', () => {
  test("groups and sorts plugins' items by id", async () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      [DEFAULT_EDITOR_CONTEXT_MENU.clipboard.id]: [
        { type: 'item', id: '35-plain', label: 'Plain paste', command: () => {} },
      ],
      '30-plugin': [{ type: 'item', id: '20-second', label: 'Second', command: () => {} }],
      '05-top': [{ type: 'item', id: '10-top', label: 'Top', command: () => {} }],
    });
    editor.addContextMenuItems({
      '30-plugin': [
        { type: 'item', id: '10-first', label: 'First', command: () => {} },
        { type: 'item', id: '30-same', label: 'Zebra', command: () => {} },
        { type: 'item', id: '30-same', label: 'Apple', command: () => {} },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    // An item's label is its first node, ahead of its shortcut.
    const menu = [
      ...document.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-separator"]'),
    ].map((element) =>
      element.getAttribute('data-slot') === 'context-menu-separator' ? '-' : element.firstChild?.textContent,
    );
    expect(menu).toEqual(['Top', '-', 'Paste', 'Plain paste', '-', 'First', 'Second', 'Apple', 'Zebra']);
  });

  test("runs plugin's item, and hides it when not shown", async () => {
    const editor = new EditorManager();
    const command = vi.fn();
    let shown = true;
    editor.addContextMenuItems({
      plugin: [{ type: 'item', id: 'item', label: 'Plugin item', command, shown: () => shown }],
    });
    const view = await mount(editor);

    await open(view, 0);
    await userEvent.click(item('Plugin item'));
    expect(command).toHaveBeenCalledWith(view);

    shown = false;
    await open(view, 0);
    expect(item('Plugin item').query()).toBeNull();
  });

  test("groups and sorts submenu's items by id", async () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: {
            '20-last': [{ type: 'item', id: '10-c', label: 'C', command: () => {} }],
            '10-first': [
              { type: 'item', id: '20-b', label: 'B', command: () => {} },
              { type: 'item', id: '10-a', label: 'A', command: () => {} },
            ],
          },
        },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    await userEvent.click(item('More'));
    await expect.element(item('A')).toBeVisible();
    const submenu = [
      ...(document
        .querySelector('[data-slot="context-menu-sub-content"]')
        ?.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-separator"]') ?? []),
    ].map((element) => (element.getAttribute('data-slot') === 'context-menu-separator' ? '-' : element.textContent));
    expect(submenu).toEqual(['A', 'B', '-', 'C']);
  });

  test("runs submenu's item", async () => {
    const editor = new EditorManager();
    const command = vi.fn();
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: {
            inner: [
              {
                type: 'submenu',
                id: 'deeper',
                label: 'Deeper',
                items: { innermost: [{ type: 'item', id: 'item', label: 'Nested item', command }] },
              },
            ],
          },
        },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    await userEvent.click(item('More'));
    await userEvent.click(item('Deeper'));
    await userEvent.click(item('Nested item'));
    expect(command).toHaveBeenCalledWith(view);
  });

  test("doesn't draw submenu with nothing shown", async () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: { inner: [{ type: 'item', id: 'item', label: 'Hidden item', command: () => {}, shown: () => false }] },
        },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    expect(item('More').query()).toBeNull();
  });

  test("merges same-id submenus in group under first's label", async () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: { inner: [{ type: 'item', id: '10-a', label: 'A', command: () => {} }] },
        },
      ],
    });
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'Other',
          items: { inner: [{ type: 'item', id: '20-b', label: 'B', command: () => {} }] },
        },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    expect(item('More').elements()).toHaveLength(1);
    expect(item('Other').query()).toBeNull();
    await userEvent.click(item('More'));
    await expect.element(item('A')).toBeVisible();
    await expect.element(item('B')).toBeVisible();
  });

  test('merges same-id submenus nested in merged ones', async () => {
    const editor = new EditorManager();
    for (const [id, label] of [
      ['10-a', 'A'],
      ['20-b', 'B'],
    ]) {
      editor.addContextMenuItems({
        plugin: [
          {
            type: 'submenu',
            id: 'more',
            label: 'More',
            items: {
              inner: [
                {
                  type: 'submenu',
                  id: 'deeper',
                  label: 'Deeper',
                  items: { innermost: [{ type: 'item', id, label, command: () => {} }] },
                },
              ],
            },
          },
        ],
      });
    }
    const view = await mount(editor);

    await open(view, 0);
    await userEvent.click(item('More'));
    await expect.element(item('Deeper')).toBeVisible();
    expect(item('Deeper').elements()).toHaveLength(1);
    await userEvent.click(item('Deeper'));
    await expect.element(item('A')).toBeVisible();
    await expect.element(item('B')).toBeVisible();
  });

  test('keeps same-id submenus in different groups, and same-id items, apart', async () => {
    const editor = new EditorManager();
    editor.addContextMenuItems({
      a: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: { inner: [{ type: 'item', id: '10-a', label: 'A', command: () => {} }] },
        },
        { type: 'item', id: 'more', label: 'Item', command: () => {} },
      ],
      b: [
        {
          type: 'submenu',
          id: 'more',
          label: 'Extra',
          items: { inner: [{ type: 'item', id: '20-b', label: 'B', command: () => {} }] },
        },
      ],
    });
    const view = await mount(editor);

    await open(view, 0);
    await expect.element(item('More')).toBeVisible();
    await expect.element(item('Item')).toBeVisible();
    await expect.element(item('Extra')).toBeVisible();
  });

  test("removes disposed plugin's items from merged submenu", async () => {
    const editor = new EditorManager();
    const dispose = editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'More',
          items: { inner: [{ type: 'item', id: '10-a', label: 'A', command: () => {} }] },
        },
      ],
    });
    editor.addContextMenuItems({
      plugin: [
        {
          type: 'submenu',
          id: 'more',
          label: 'Other',
          items: { inner: [{ type: 'item', id: '20-b', label: 'B', command: () => {} }] },
        },
      ],
    });
    dispose();
    const view = await mount(editor);

    await open(view, 0);
    expect(item('More').query()).toBeNull();
    await userEvent.click(item('Other'));
    await expect.element(item('B')).toBeVisible();
    expect(item('A').query()).toBeNull();
  });
});
