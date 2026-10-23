import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, EDITOR_DOCUMENT } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { SplitLayout, type SplitLayoutProps } from '@/editor/layouts/split-layout';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('\n');
// Changes `beta` on line 2 and deletes `delta`.
const CODE = ['alpha', 'BETA', 'gamma', 'epsilon'].join('\n');

// Puts the document's layout into the content's `data-layout`, or `loading` while it is null.
const LAYOUT_ATTRIBUTE = EditorView.contentAttributes.compute([EDITOR_DOCUMENT], (state) => {
  const layout = state.facet(EDITOR_DOCUMENT)?.layout;
  return { 'data-layout': layout === undefined ? 'loading' : layout.type === 'split' ? layout.side : layout.type };
});

// Renders a `SplitLayout` with `props` in the app's contexts, and returns its sides' views and a way to render it
// again.
async function mount(props: Partial<SplitLayoutProps>, editor = new EditorManager()) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
  const commands = new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
  });
  const servers = new LanguageServers(editor);
  const session = { current: null };
  const tree = (next: Partial<SplitLayoutProps>) => (
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={servers}>
            <div style={{ height: 200 }}>
              <SplitLayout
                relativePath="main.txt"
                base={{ source: { type: 'blob' }, code: BASE }}
                target={{ source: { type: 'workingTree' }, code: CODE }}
                extensions={[]}
                session={session}
                {...next}
              />
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>
  );
  const screen = await render(tree(props));
  const side = (name: 'a' | 'b') => () => {
    const element = screen.container.querySelector<HTMLElement>(`.cm-merge-${name}`);
    const found = element === null ? null : EditorView.findFromDOM(element);
    if (found === null) {
      throw new Error(`missing ${name} side`);
    }
    return found;
  };
  await expect.poll(() => screen.container.querySelector('.cm-merge-b')).not.toBeNull();

  return {
    base: side('a'),
    target: side('b'),
    commands,
    rerender: (next: Partial<SplitLayoutProps>) => screen.rerender(tree(next)),
  };
}

// Returns the number of changed lines that `view` shows.
function changedLines(view: EditorView): number {
  return view.dom.querySelectorAll('.cm-changedLine').length;
}

describe('SplitLayout', () => {
  test('shows base beside target', async () => {
    const { base, target } = await mount({});

    expect(base().state.doc.toString()).toBe(BASE);
    expect(target().state.doc.toString()).toBe(CODE);
    expect(base().dom.getBoundingClientRect().right).toBeLessThanOrEqual(target().dom.getBoundingClientRect().left);
  });

  test('marks changes on both sides', async () => {
    const { base, target } = await mount({});

    await expect.poll(() => changedLines(target())).toBe(1);
    expect(changedLines(base())).toBe(2);
  });

  test('describes sides to plugins', async () => {
    const editor = new EditorManager();
    editor.addExtensions([LAYOUT_ATTRIBUTE]);
    const { base, target } = await mount({}, editor);

    await expect.poll(() => base().contentDOM.dataset.layout).toBe('base');
    expect(target().contentDOM.dataset.layout).toBe('target');
  });

  test('edits target but not blob base', async () => {
    const { base, target, commands } = await mount({});
    base().dispatch({ selection: { anchor: 0 } });
    target().dispatch({ selection: { anchor: 0 } });

    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, base());
    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, target());

    expect(base().state.doc.toString()).toBe(BASE);
    expect(target().state.doc.toString()).toBe(CODE.slice('alpha\n'.length));
  });

  test('keeps two blobs read-only', async () => {
    const { target, commands } = await mount({ target: { source: { type: 'blob' }, code: CODE } });
    target().dispatch({ selection: { anchor: 0 } });

    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, target());

    expect(target().state.doc.toString()).toBe(CODE);
  });

  test('scrolls sides together', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    expect(target().scrollDOM.scrollHeight).toBeGreaterThan(target().scrollDOM.clientHeight);

    target().scrollDOM.scrollTop = 500;

    await expect.poll(() => base().scrollDOM.scrollTop).toBe(500);
  });

  test('hides stripe of base', async () => {
    const { base, target } = await mount({});

    expect(base().dom.querySelector('.cm-stripe')).toBeNull();
    expect(target().dom.querySelector('.cm-stripe')).not.toBeNull();
  });

  test('keeps rows level with search bar on one side', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    openSearchPanel(base());
    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBeGreaterThan(0);

    target().scrollDOM.scrollTop = 500;

    const line = target().state.doc.lineAt(target().lineBlockAtHeight(560).from).number;
    const top = (view: EditorView) => view.coordsAtPos(view.state.doc.line(line).from)?.top;
    await expect.poll(() => top(base())).toBe(top(target()));
  });

  test('opens search bar on one side', async () => {
    const { base, target } = await mount({});

    openSearchPanel(base());

    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBeGreaterThan(0);
    expect(target().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBe(0);
  });

  test('finds in base by keyboard', async () => {
    const { base } = await mount({});

    await userEvent.click(base().contentDOM);
    await userEvent.keyboard('{Meta>}f{/Meta}');
    await userEvent.keyboard('gamma');

    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.textContent).toContain('1/1');
  });

  test('replaces base in place', async () => {
    const { base, target, rerender } = await mount({});
    await expect.poll(() => changedLines(target())).toBe(1);
    const shown = base();

    await rerender({ base: { source: { type: 'blob' }, code: CODE } });

    await expect.poll(() => changedLines(target())).toBe(0);
    expect(base()).toBe(shown);
  });

  test('rebuilds on target change', async () => {
    const { target, rerender } = await mount({});
    const shown = target();

    await rerender({ target: { source: { type: 'workingTree' }, code: `${CODE}\n` } });

    await expect.poll(() => target()).not.toBe(shown);
    expect(target().state.doc.toString()).toBe(`${CODE}\n`);
  });

  test('keeps CRLF base on mount', async () => {
    const replaced = vi.fn();
    await mount({
      base: { source: { type: 'blob' }, code: BASE.replaceAll('\n', '\r\n') },
      target: { source: { type: 'workingTree' }, code: CODE.replaceAll('\n', '\r\n') },
      extensions: EditorView.updateListener.of((update) => {
        if (update.docChanged && update.view.dom.classList.contains('cm-merge-a')) {
          replaced();
        }
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(replaced).not.toHaveBeenCalled();
  });
});
