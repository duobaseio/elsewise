import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { updateOriginalDoc } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, EDITOR_DOCUMENT } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { UnifiedLayout, type UnifiedLayoutProps } from '@/editor/layouts/unified-layout';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../../test/commands';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('\n');
// Changes `beta` on line 2 and deletes `delta`.
const CODE = ['alpha', 'BETA', 'gamma', 'epsilon'].join('\n');

// Puts the document's layout into the content's `data-layout`, or `loading` while it is null.
const LAYOUT_ATTRIBUTE = EditorView.contentAttributes.compute([EDITOR_DOCUMENT], (state) => ({
  'data-layout': state.facet(EDITOR_DOCUMENT)?.layout.type ?? 'loading',
}));

// Returns a language for `.late` files whose support loads when `loaded` resolves.
function lateLanguage(loaded: Promise<void>): LanguageDescription {
  return LanguageDescription.of({
    name: 'Late',
    extensions: ['late'],
    load: async () => {
      await loaded;
      return new LanguageSupport(
        StreamLanguage.define({
          token: (stream) => {
            stream.skipToEnd();
            return null;
          },
        }),
      );
    },
  });
}

// Renders a `UnifiedLayout` with `props` in the app's contexts, and returns its view and a way to render it again.
async function mount(props: Partial<UnifiedLayoutProps>, editor = new EditorManager()) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
  const commands = new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
  });
  const servers = new LanguageServers(editor);
  const session = { current: null };
  const tree = (next: Partial<UnifiedLayoutProps>) => (
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={servers}>
            <div style={{ height: 300 }}>
              <UnifiedLayout
                source={{ type: 'workingTree' }}
                relativePath="main.txt"
                code={CODE}
                base={null}
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
  const view = () => {
    const element = screen.container.querySelector<HTMLElement>('.cm-editor');
    const found = element === null ? null : EditorView.findFromDOM(element);
    if (found === null) {
      throw new Error('missing editor');
    }
    return found;
  };
  await expect.poll(() => screen.container.querySelector('.cm-editor')).not.toBeNull();

  return { view, commands, rerender: (next: Partial<UnifiedLayoutProps>) => screen.rerender(tree(next)) };
}

// Returns the revert buttons in `view`'s gutter, which CodeMirror hides from accessibility queries.
function reverts(view: EditorView): Element[] {
  return [...view.dom.querySelectorAll('.cm-revertGutter [aria-label="Revert change"]')];
}

// Returns the number of changed lines that `view` shows.
function changedLines(view: EditorView): number {
  return view.dom.querySelectorAll('.cm-changedLine').length;
}

describe('UnifiedLayout', () => {
  test('shows plain editor without base', async () => {
    const editor = new EditorManager();
    editor.addExtensions([LAYOUT_ATTRIBUTE]);
    const { view } = await mount({}, editor);

    await expect.poll(() => view().contentDOM.dataset.layout).toBe('editor');
    expect(changedLines(view())).toBe(0);
  });

  test('diffs against base inline', async () => {
    const editor = new EditorManager();
    editor.addExtensions([LAYOUT_ATTRIBUTE]);
    const { view } = await mount({ base: BASE }, editor);

    await expect.poll(() => changedLines(view())).toBe(1);
    expect(view().contentDOM.dataset.layout).toBe('unified');
    expect(
      [...view().dom.querySelectorAll('.cm-deletedChunk .cm-deletedLine')].map((line) => line.textContent),
    ).toEqual(['beta', 'delta']);
  });

  test('reverts change into working tree', async () => {
    const { view } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);

    await expect.poll(() => reverts(view())).toHaveLength(2);
    await userEvent.click(reverts(view())[0] as Element);

    expect(view().state.doc.line(2).text).toBe('beta');
  });

  test('offers revert in gutter beside each change', async () => {
    const { view } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);

    await expect.poll(() => reverts(view())).toHaveLength(2);
    const content = view().contentDOM.getBoundingClientRect().left;
    for (const button of reverts(view())) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(content);
    }
    expect(view().dom.querySelector('.cm-chunkButtons')).toBeNull();
  });

  test('names revert in tooltip', async () => {
    const { view } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);

    await expect.poll(() => reverts(view())).toHaveLength(2);
    await userEvent.hover(reverts(view())[0] as Element);

    await expect.element(page.getByText('Revert change')).toBeVisible();
  });

  test('offers no revert into blob', async () => {
    const { view } = await mount({ source: { type: 'blob' }, base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);

    expect(view().dom.querySelector('.cm-revert')).toBeNull();
  });

  test('waits for language before diffing', async () => {
    let load = () => {};
    const loaded = new Promise<void>((resolve) => {
      load = resolve;
    });
    const editor = new EditorManager();
    editor.languages.add([lateLanguage(loaded)]);
    const { view } = await mount({ relativePath: 'main.late', base: BASE }, editor);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changedLines(view())).toBe(0);

    load();

    await expect.poll(() => changedLines(view())).toBe(1);
  });

  test('replaces base in place', async () => {
    const { view, rerender } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);
    const shown = view();

    await rerender({ base: CODE });

    await expect.poll(() => changedLines(view())).toBe(0);
    expect(view()).toBe(shown);
  });

  test('stops diffing in place', async () => {
    const editor = new EditorManager();
    editor.addExtensions([LAYOUT_ATTRIBUTE]);
    const { view, rerender } = await mount({ base: BASE }, editor);
    await expect.poll(() => changedLines(view())).toBe(1);
    const shown = view();

    await rerender({ base: null });

    await expect.poll(() => changedLines(view())).toBe(0);
    expect(view().contentDOM.dataset.layout).toBe('editor');
    expect(view()).toBe(shown);
  });

  test('keeps diff across rebuild', async () => {
    const { view, rerender } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);
    const shown = view();

    // Adds a line, so the diff shows it beside `BETA`.
    await rerender({ base: BASE, code: `zeta\n${CODE}` });

    await expect.poll(() => view()).not.toBe(shown);
    expect(changedLines(view())).toBe(2);
  });

  test('diffs blob read-only', async () => {
    const { view, commands } = await mount({ source: { type: 'blob' }, base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);
    view().dispatch({ selection: { anchor: 0 } });

    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, view());

    expect(view().state.doc.toString()).toBe(CODE);
  });

  test('rebuilds on source change', async () => {
    const { view, rerender } = await mount({ base: BASE });
    await expect.poll(() => changedLines(view())).toBe(1);
    const shown = view();

    await rerender({ source: { type: 'blob' }, base: BASE });

    await expect.poll(() => view()).not.toBe(shown);
    expect(changedLines(view())).toBe(1);
  });

  test('drops working tree edits for blob of same code', async () => {
    const { view, rerender } = await mount({});
    view().dispatch({ changes: { from: 0, insert: 'x' } });
    const shown = view();

    await rerender({ source: { type: 'blob' } });

    await expect.poll(() => view()).not.toBe(shown);
    expect(view().state.doc.toString()).toBe(CODE);
  });

  test('keeps CRLF base on mount', async () => {
    const replaced = vi.fn();
    await mount({
      code: CODE.replaceAll('\n', '\r\n'),
      base: BASE.replaceAll('\n', '\r\n'),
      extensions: EditorView.updateListener.of((update) => {
        if (update.transactions.some((tr) => tr.effects.some((effect) => effect.is(updateOriginalDoc)))) {
          replaced();
        }
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(replaced).not.toHaveBeenCalled();
  });
});
