import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { PreviewLayout } from '@/editor/layouts/preview-layout';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { memoryRouter } from '../../../test/commands';

const CODE = ['alpha', 'beta', 'gamma'].join('\n');

// Renders a `PreviewLayout` of `CODE` in the app's contexts, and returns its view.
async function mount(editor = new EditorManager()) {
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
    terminal: new TerminalManager(),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={new LanguageServers(editor)}>
            <div style={{ height: 300 }}>
              <PreviewLayout code={CODE} relativePath="main.txt" />
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>,
  );
  await expect.poll(() => screen.container.querySelector('.cm-editor')).not.toBeNull();

  const element = screen.container.querySelector<HTMLElement>('.cm-editor') as HTMLElement;
  const view = EditorView.findFromDOM(element);
  if (view === null) {
    throw new Error('missing editor');
  }
  return view;
}

describe('PreviewLayout', () => {
  test('leaves out plugins', async () => {
    const editor = new EditorManager();
    const called = vi.fn(() => []);
    editor.addExtensions([EditorView.contentAttributes.of({ 'data-plugin': '' }), called]);
    const view = await mount(editor);

    expect(view.contentDOM.dataset.plugin).toBeUndefined();
    expect(called).not.toHaveBeenCalled();
  });

  test('indents with tab', async () => {
    const view = await mount();
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });

    await userEvent.keyboard('delta{Tab}');

    expect(view.state.doc.line(1).text).toBe('  deltaalpha');
  });

  test('undoes typing', async () => {
    const view = await mount();
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });

    await userEvent.keyboard('delta');
    expect(view.state.doc.line(1).text).toBe('deltaalpha');
    await userEvent.keyboard('{Meta>}z{/Meta}');

    expect(view.state.doc.toString()).toBe(CODE);
  });

  test('leaves out scrollbar markers', async () => {
    const view = await mount();

    expect(view.dom.querySelector('.cm-scrollbar-markers')).toBeNull();
  });
});
