import { startCompletion } from '@codemirror/autocomplete';
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { Compartment, EditorState, type Extension, Facet, Prec, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import {
  DEFAULT_COMMANDS,
  EDITOR_DOCUMENT,
  type EditorCommand,
  type EditorDocument,
  type EditorDocumentLayout,
  type LanguageServer,
} from '@elsewise/plugin';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme, THEMES } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import {
  applyPlugins,
  type EditorSource,
  PLUGINS,
  useCompartment,
  useEditorExtensions,
  useLanguage,
  usePlugins,
} from '@/editor/layouts/layout';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { memoryRouter } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

const BASE: EditorDocumentLayout = { type: 'split', side: 'base' };

interface LayoutProps {
  readonly initialSource: EditorSource;
  readonly relativePath: string;
  readonly layout: EditorDocumentLayout;
  readonly initialCode: string;
  readonly onSource: (set: (source: EditorSource) => void) => void;
  readonly onCode: (set: (code: string) => void) => void;
}

// Builds a view of `code` from `source`, applies the plugins, and rebuilds it when the code, line separator or source's
// type changes.
function Layout({ initialSource, relativePath, layout, initialCode, onSource, onCode }: LayoutProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const [source, setSource] = useState(initialSource);
  const [code, setCode] = useState(initialCode);
  onSource(setSource);
  onCode(setCode);
  const { core, plugins, portal, lineSeparator } = useEditorExtensions(view, { source, relativePath, code, layout });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `core` and `plugins` are only read on build.
  useEffect(() => {
    if (host.current === null) {
      return;
    }

    const editor = new EditorView({ state: EditorState.create({ doc: code, extensions: core }), parent: host.current });
    view.current = editor;
    applyPlugins(editor, plugins);

    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [code, lineSeparator, source.type]);

  return (
    <div style={{ height: 300 }}>
      <div ref={host} />
      {portal}
    </div>
  );
}

interface MountOptions {
  readonly root?: URL;
  readonly relativePath?: string;
  readonly code?: string;
  readonly layout?: EditorDocumentLayout;
  readonly settings?: Settings;
  readonly editor?: EditorManager;
}

// Renders a `Layout` of the file from a source of `type` in the app's contexts, and returns its view and ways to change
// its inputs. `root` is the working tree's.
async function mount(
  type: EditorSource['type'],
  {
    root,
    relativePath = 'main.txt',
    code = 'alpha beta alpha\n',
    layout = { type: 'editor' },
    settings = withSettings(),
    editor = new EditorManager(),
  }: MountOptions = {},
) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, settings);
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
  let setSource: (source: EditorSource) => void = () => {};
  let setCode: (code: string) => void = () => {};
  const screen = await render(
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={new LanguageServers(editor)}>
            <Layout
              initialSource={type === 'workingTree' ? { type, root } : { type }}
              relativePath={relativePath}
              layout={layout}
              initialCode={code}
              onSource={(set) => {
                setSource = set;
              }}
              onCode={(set) => {
                setCode = set;
              }}
            />
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>,
  );
  const view = () => {
    const element = screen.container.querySelector<HTMLElement>('.cm-editor');
    const found = element === null ? null : EditorView.findFromDOM(element);
    if (found === null) {
      throw new Error('missing editor');
    }
    return found;
  };
  await expect.poll(() => screen.container.querySelector('.cm-editor')).not.toBeNull();

  return {
    view,
    commands,
    settings: (settings: Settings) => client.setQueryData(settingsQuery.queryKey, settings),
    source: (source: EditorSource) => setSource(source),
    code: (code: string) => setCode(code),
  };
}

// Returns the settings with `general` and `editor` over the defaults, in light brightness.
function withSettings(
  general: Partial<Settings['appearance']['general']> = {},
  editor: Partial<Settings['appearance']['editor']> = {},
): Settings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light', ...general },
      editor: { ...DEFAULT_SETTINGS.appearance.editor, visualGuides: [], ...editor },
    },
  };
}

// Returns a language server for Rust files that only responds to `initialize`, and the messages it was sent.
function rustServer(): { server: LanguageServer; sent: StubTransport['sent'] } {
  const transport = new StubTransport();
  return {
    sent: transport.sent,
    server: { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => transport },
  };
}

// Returns a language for `.comment` files that highlights every line as a comment, marks the content with its name,
// and loads once `loaded` resolves.
function commentLanguage(loaded: Promise<void> = Promise.resolve()): LanguageDescription {
  return LanguageDescription.of({
    name: 'Comment',
    extensions: ['comment'],
    load: async () => {
      await loaded;
      return new LanguageSupport(
        StreamLanguage.define({
          token: (stream) => {
            stream.skipToEnd();
            return 'comment';
          },
        }),
        EditorView.contentAttributes.of({ 'data-language': 'Comment' }),
      );
    },
  });
}

// A plugin's extension that marks the content with the document's path and layout, or `loading` while it is null.
const DOCUMENT_ATTRIBUTE = EditorView.contentAttributes.compute([EDITOR_DOCUMENT], (state) => {
  const document = state.facet(EDITOR_DOCUMENT);
  if (document === null) {
    return { 'data-document': 'loading' };
  }
  const { relativePath, layout } = document;
  return { 'data-document': `${relativePath} ${layout.type === 'split' ? `split ${layout.side}` : layout.type}` };
});

afterEach(() => {
  vi.restoreAllMocks();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  document.documentElement.style.removeProperty('--font-mono');
  document.documentElement.style.removeProperty('--text-code--line-height');
});

// Returns the CSS color of Elsewise's `role` token at `brightness`.
function tokenColor(role: 'keyword' | 'comment', brightness: 'light' | 'dark'): string {
  const { tokens } = resolveActiveTheme(THEMES, { source: 'elsewise', name: 'elsewise' }, brightness).editor;
  const hex = tokens[role]?.color;
  if (hex === undefined) {
    throw new Error(`missing ${role} color`);
  }
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

// Returns the color of the first token on the first line, once there is one.
function firstTokenColor(view: EditorView): string | undefined {
  const token = view.contentDOM.querySelector('.cm-line span');
  return token === null ? undefined : getComputedStyle(token).color;
}

describe('useEditorExtensions', () => {
  test('rebuilds read-only on switch to blob', async () => {
    const { view, commands, source } = await mount('workingTree');
    const shown = view();

    source({ type: 'blob' });

    await expect.poll(() => view()).not.toBe(shown);
    view().dispatch({ selection: { anchor: 2 } });
    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, view());
    expect(view().state.doc.toString()).toBe('alpha beta alpha\n');
  });

  describe('working tree', () => {
    test('remeasures font restored after rebuild', async () => {
      // Notifies the settings' readers right away, so that a test can change them in the same render as the code.
      notifyManager.setScheduler((callback) => callback());
      // Keeps the lines' height, as the app's theme does, so that a change of font does not resize the lines.
      document.documentElement.style.setProperty('--text-code--line-height', '20px');
      document.documentElement.style.setProperty('--font-mono', 'monospace');
      const monospace = withSettings({}, { font: { ...DEFAULT_SETTINGS.appearance.editor.font, family: 'monospace' } });
      const serif = withSettings({}, { font: { ...DEFAULT_SETTINGS.appearance.editor.font, family: 'serif' } });
      const { view, settings, code } = await mount('workingTree', {
        code: 'fn main() {}',
        settings: monospace,
      });
      const width = view().defaultCharacterWidth;

      // Changes the font in the same render as the code, which rebuilds the view. Changes the CSS variable that the
      // editor's theme reads the font from along with the settings, as the app does.
      document.documentElement.style.setProperty('--font-mono', 'serif');
      settings(serif);
      code('fn main() {}\n');
      await expect.poll(() => view().state.doc.toString()).toBe('fn main() {}\n');
      await expect.poll(() => view().defaultCharacterWidth).not.toBe(width);

      document.documentElement.style.setProperty('--font-mono', 'monospace');
      settings(monospace);

      await expect.poll(() => view().defaultCharacterWidth).toBe(width);
    });

    test('remeasures line height', async () => {
      notifyManager.setScheduler((callback) => callback());
      document.documentElement.style.setProperty('--text-code--line-height', '18px');
      const { view, settings } = await mount('workingTree', { code: 'fn main() {}' });
      await expect.poll(() => view().defaultLineHeight).toBe(18);

      // Changes the CSS variable that the editor's theme reads the line height from along with the settings, as the
      // app does.
      document.documentElement.style.setProperty('--text-code--line-height', '30px');
      settings(withSettings({}, { font: { ...DEFAULT_SETTINGS.appearance.editor.font, lineHeight: 2.5 } }));

      await expect.poll(() => view().defaultLineHeight).toBe(30);
    });

    test('edits with undo history', async () => {
      const { view, commands } = await mount('workingTree', { code: 'main\n' });

      await userEvent.click(view().contentDOM);
      await userEvent.keyboard('x');
      await expect.poll(() => view().state.doc.toString()).not.toBe('main\n');
      commands.run(DEFAULT_COMMANDS.editor.history.undo, view());

      expect(view().state.doc.toString()).toBe('main\n');
    });

    test('connects language server for file with root', async () => {
      const editor = new EditorManager();
      const { server, sent } = rustServer();
      editor.languages.addServers([server]);
      await mount('workingTree', { root: new URL('file:///worktree/'), relativePath: 'src/main.rs', editor });

      await expect
        .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
        .toMatchObject({ params: { textDocument: { uri: 'file:///worktree/src/main.rs', languageId: 'rust' } } });
    });

    test('connects no language server without root', async () => {
      const editor = new EditorManager();
      const { server, sent } = rustServer();
      editor.languages.addServers([server]);
      await mount('workingTree', { relativePath: 'src/main.rs', editor });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sent).toEqual([]);
    });

    test('applies theme without rebuild', async () => {
      const { view, settings } = await mount('workingTree');
      const built = view();
      built.dispatch({ selection: { anchor: 3 } });
      const background = getComputedStyle(built.dom).backgroundColor;

      settings(withSettings({ brightness: 'dark' }));

      await expect.poll(() => getComputedStyle(built.dom).backgroundColor).not.toBe(background);
      expect(view()).toBe(built);
      expect(built.state.selection.main.head).toBe(3);
    });

    test('applies settings without rebuild', async () => {
      const { view, settings } = await mount('workingTree', {
        settings: withSettings({}, { lineNumbers: true }),
      });
      const built = view();
      built.dispatch({ selection: { anchor: 3 } });
      expect(built.dom.querySelector('.cm-lineNumbers')).not.toBeNull();

      settings(withSettings({}, { lineNumbers: false }));

      await expect.poll(() => built.dom.querySelector('.cm-lineNumbers')).toBeNull();
      expect(view()).toBe(built);
      expect(built.state.selection.main.head).toBe(3);
    });

    test('applies keymap without rebuild', async () => {
      const { view, commands } = await mount('workingTree');
      const built = view();
      built.dispatch({ selection: { anchor: 3 } });
      const run = vi.fn<EditorCommand['run']>(() => true);

      commands.add([{ id: 'test.command', label: 'Test', scope: 'editor', defaultKeys: ['F20'], run }]);

      await expect
        .poll(() => {
          built.contentDOM.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'F20', code: 'F20', keyCode: 131, bubbles: true, cancelable: true }),
          );
          return run.mock.lastCall?.[1];
        })
        .toBe(built);
      expect(view()).toBe(built);
      expect(built.state.selection.main.head).toBe(3);
    });

    test('applies language without rebuild', async () => {
      const editor = new EditorManager();
      const { view } = await mount('workingTree', { relativePath: 'main.comment', editor });
      const built = view();
      built.dispatch({ selection: { anchor: 3 } });

      editor.languages.add([commentLanguage()]);

      await expect.poll(() => built.contentDOM.dataset.language).toBe('Comment');
      expect(view()).toBe(built);
      expect(built.state.selection.main.head).toBe(3);
    });

    test('describes document by path and layout', async () => {
      const editor = new EditorManager();
      editor.addExtensions([DOCUMENT_ATTRIBUTE]);
      const { view } = await mount('workingTree', {
        relativePath: 'src/main.txt',
        layout: { type: 'unified' },
        editor,
      });

      await expect.poll(() => view().contentDOM.dataset.document).toBe('src/main.txt unified');
    });

    test('withholds document while language loads', async () => {
      const editor = new EditorManager();
      const { promise, resolve } = Promise.withResolvers<void>();
      editor.languages.add([commentLanguage(promise)]);
      editor.addExtensions([DOCUMENT_ATTRIBUTE]);
      const { view } = await mount('workingTree', { relativePath: 'main.comment', editor });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(view().contentDOM.dataset.document).toBe('loading');

      resolve();

      await expect.poll(() => view().contentDOM.dataset.document).toBe('main.comment editor');
    });

    test('applies plugins after rebuild', async () => {
      const editor = new EditorManager();
      editor.addExtensions([EditorView.contentAttributes.of({ 'data-plugin': '' })]);
      const { view, code } = await mount('workingTree', { editor });
      const built = view();
      expect(built.contentDOM.dataset.plugin).toBe('');

      code('fn main() {}\n\n');

      await expect.poll(() => view()).not.toBe(built);
      expect(view().contentDOM.dataset.plugin).toBe('');
    });

    test('drops plugins that throw on reconfigure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const editor = new EditorManager();
      const broken = StateField.define({
        create: () => {
          throw new Error('broken');
        },
        update: (value) => value,
      });
      editor.addExtensions([EditorView.contentAttributes.of({ 'data-plugin': '' }), broken]);
      const { view } = await mount('workingTree', { code: 'main\n', editor });

      expect(view().contentDOM.dataset.plugin).toBeUndefined();
      await userEvent.click(view().contentDOM);
      await userEvent.keyboard('x');
      await expect.poll(() => view().state.doc.toString()).not.toBe('main\n');
    });

    test('detects line separator in code', async () => {
      const { view } = await mount('workingTree', { code: 'a\r\nb' });

      expect(view().state.lineBreak).toBe('\r\n');
    });

    test('follows line separator setting', async () => {
      const { view } = await mount('workingTree', {
        code: 'a\nb',
        settings: withSettings({}, { lineSeparator: '\r\n' }),
      });

      expect(view().state.lineBreak).toBe('\r\n');
    });

    test('rebuilds on line separator change', async () => {
      const { view, settings } = await mount('workingTree', { code: 'a\nb' });
      const built = view();

      settings(withSettings({}, { lineSeparator: '\r\n' }));

      await expect.poll(() => view().state.lineBreak).toBe('\r\n');
      expect(view()).not.toBe(built);
    });

    test('renders search bar in portal', async () => {
      const { view } = await mount('workingTree', { code: 'a a a\n' });

      openSearchPanel(view());
      await userEvent.type(page.getByRole('textbox', { name: 'Find' }), 'a');

      await expect.element(page.getByText('1/3')).toBeVisible();
    });

    test('renders toolbar in portal', async () => {
      const editor = new EditorManager();
      editor.addToolbarItems([{ type: 'component', id: 'test.item', component: () => <span>Item</span> }]);
      const { view } = await mount('workingTree', { editor });

      await expect.element(page.getByText('Item')).toBeVisible();
      expect(view().dom.querySelector('.cm-toolbar')?.textContent).toContain('Item');
    });
  });

  describe('blob', () => {
    test('ignores typing', async () => {
      const { view } = await mount('blob');
      await userEvent.click(page.getByText('alpha beta alpha'));

      await userEvent.keyboard('x(');

      expect(view().state.doc.toString()).toBe('alpha beta alpha\n');
    });

    test('ignores edit commands', async () => {
      const { view, commands } = await mount('blob');
      view().dispatch({ selection: { anchor: 2 } });

      commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, view());
      commands.run(DEFAULT_COMMANDS.editor.edit.duplicateLine, view());

      expect(view().state.doc.toString()).toBe('alpha beta alpha\n');
    });

    test('stays read-only under plugin facets', async () => {
      const editor = new EditorManager();
      editor.addExtensions([Prec.highest(EditorState.readOnly.of(false)), Prec.highest(EditorView.editable.of(true))]);
      const { view, commands } = await mount('blob', { editor });
      view().dispatch({ selection: { anchor: 2 } });

      commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, view());

      expect(view().state.doc.toString()).toBe('alpha beta alpha\n');
    });

    test('connects no language server', async () => {
      const editor = new EditorManager();
      const { server, sent } = rustServer();
      editor.languages.addServers([server]);
      const { view } = await mount('blob', { relativePath: 'src/main.rs', code: 'fn main() {}\n', editor });
      await expect.poll(() => firstTokenColor(view())).toBe(tokenColor('keyword', 'light'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sent).toEqual([]);
    });

    test('shows no completions', async () => {
      const editor = new EditorManager();
      const options = [{ label: 'alphabet', type: 'function' }];
      editor.addExtensions([EditorState.languageData.of(() => [{ autocomplete: options }])]);
      const { view } = await mount('blob', { editor });
      view().dispatch({ selection: { anchor: 5 } });

      startCompletion(view());
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(document.querySelector('[role="option"]')).toBeNull();
    });

    test('counts search matches without replace', async () => {
      const { view, commands } = await mount('blob');
      commands.run(DEFAULT_COMMANDS.editor.search.find, view());

      await userEvent.fill(page.getByRole('textbox', { name: 'Find' }), 'alpha');

      const bar = page.elementLocator(view().dom.querySelector('[data-slot="search-bar"]') as HTMLElement);
      await expect.element(bar.getByRole('status')).toHaveTextContent('1/2');
      expect(page.getByRole('button', { name: 'Toggle replace' }).query()).toBeNull();
    });

    test('marks selection matches', async () => {
      const { view } = await mount('blob');

      await userEvent.dblClick(page.getByText('alpha beta alpha'), { position: { x: 4, y: 4 } });

      await expect.poll(() => view().dom.querySelectorAll('.cm-selectionMatch').length).toBe(1);
      expect(view().dom.querySelector('.cm-selectionBackground')).not.toBeNull();
    });

    test('highlights language', async () => {
      const { view } = await mount('blob', { relativePath: 'main.rs', code: 'fn main() {}\n' });

      await expect.poll(() => firstTokenColor(view())).toBe(tokenColor('keyword', 'light'));
    });

    test('applies theme in place', async () => {
      const { view, settings } = await mount('blob', { relativePath: 'main.rs', code: 'fn main() {}\n' });
      await expect.poll(() => firstTokenColor(view())).toBe(tokenColor('keyword', 'light'));
      const built = view();

      settings(withSettings({ brightness: 'dark' }));

      await expect.poll(() => firstTokenColor(view())).toBe(tokenColor('keyword', 'dark'));
      expect(view()).toBe(built);
    });

    test('applies settings in place', async () => {
      const { view, settings } = await mount('blob');
      expect(view().dom.querySelector('.cm-lineNumbers')).not.toBeNull();
      const built = view();

      settings(withSettings({}, { lineNumbers: false }));

      await expect.poll(() => view().dom.querySelector('.cm-lineNumbers')).toBeNull();
      expect(view()).toBe(built);
    });

    test('applies keymap in place', async () => {
      const { view, commands } = await mount('blob');
      const built = view();
      const run = vi.fn<EditorCommand['run']>(() => true);

      commands.add([{ id: 'test.command', label: 'Test', scope: 'editor', defaultKeys: ['Ctrl-k'], run }]);
      await new Promise((resolve) => setTimeout(resolve));
      view().contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, ctrlKey: true, bubbles: true }),
      );

      expect(run).toHaveBeenCalledOnce();
      expect(run.mock.lastCall?.[1]).toBe(built);
      expect(view()).toBe(built);
    });

    test('applies language in place', async () => {
      const editor = new EditorManager();
      const { view } = await mount('blob', { relativePath: 'main.comment', editor });
      const built = view();

      editor.languages.add([commentLanguage()]);

      await expect.poll(() => firstTokenColor(view())).toBe(tokenColor('comment', 'light'));
      expect(view()).toBe(built);
    });

    test('provides path and layout', async () => {
      const editor = new EditorManager();
      editor.addExtensions([DOCUMENT_ATTRIBUTE]);
      const { view } = await mount('blob', { relativePath: 'src/main.txt', layout: BASE, editor });

      expect(view().contentDOM.dataset.document).toBe('src/main.txt split base');
    });

    test('provides no document while language loads', async () => {
      const editor = new EditorManager();
      const { promise, resolve } = Promise.withResolvers<void>();
      editor.languages.add([commentLanguage(promise)]);
      editor.addExtensions([DOCUMENT_ATTRIBUTE]);
      const { view } = await mount('blob', { relativePath: 'main.comment', layout: BASE, editor });
      expect(view().contentDOM.dataset.document).toBe('loading');

      resolve();

      await expect.poll(() => view().contentDOM.dataset.document).toBe('main.comment split base');
    });

    test('passes document to plugin function', async () => {
      const editor = new EditorManager();
      editor.addExtensions([
        ({ relativePath, layout }) =>
          EditorView.contentAttributes.of({ 'data-document': `${relativePath} ${layout.type}` }),
      ]);
      const { view } = await mount('blob', { relativePath: 'main.txt', layout: { type: 'unified' }, editor });

      expect(view().contentDOM.dataset.document).toBe('main.txt unified');
    });

    test('applies plugin added after build', async () => {
      const editor = new EditorManager();
      const { view } = await mount('blob', { editor });
      const built = view();

      editor.addExtensions([EditorView.contentAttributes.of({ 'data-plugin': '' })]);

      await expect.poll(() => view().contentDOM.dataset.plugin).toBe('');
      expect(view()).toBe(built);
    });

    test('drops plugins once one throws', async () => {
      const editor = new EditorManager();
      editor.addExtensions([EditorView.contentAttributes.of({ 'data-plugin': '' })]);
      const { view } = await mount('blob', { editor });
      expect(view().contentDOM.dataset.plugin).toBe('');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      editor.addExtensions([
        StateField.define({
          create: () => {
            throw new Error('broken');
          },
          update: (value) => value,
        }),
      ]);

      await expect.poll(() => view().contentDOM.dataset.plugin).toBeUndefined();
      expect(view().state.doc.toString()).toBe('alpha beta alpha\n');
      expect(error).toHaveBeenCalledWith('Plugin extension failed', expect.any(Error));
    });

    test('defaults line separator to content', async () => {
      const { view, code } = await mount('blob', { code: 'alpha\r\nbeta' });
      expect(view().state.lineBreak).toBe('\r\n');

      code('alpha\nbeta');

      await expect.poll(() => view().state.lineBreak).toBe('\n');
    });

    test('prefers line separator setting', async () => {
      const { view, settings } = await mount('blob', { code: 'alpha\nbeta' });

      settings(withSettings({}, { lineSeparator: '\r\n' }));

      await expect.poll(() => view().state.lineBreak).toBe('\r\n');
    });

    test('renders search bar and toolbar', async () => {
      const { view, commands } = await mount('blob');

      commands.run(DEFAULT_COMMANDS.editor.search.find, view());

      await expect.poll(() => view().dom.querySelector('[data-slot="search-bar"]')).not.toBeNull();
      expect(view().dom.querySelector('.cm-toolbar [data-slot="toolbar"]')).not.toBeNull();
    });
  });
});

// Returns a language for files with `extension` whose latest load settles once `load` or `fail` is called.
function lateLanguage(name: string, extension: string) {
  let pending = Promise.withResolvers<LanguageSupport>();
  return {
    description: LanguageDescription.of({
      name,
      extensions: [extension],
      load: () => {
        pending = Promise.withResolvers<LanguageSupport>();
        return pending.promise;
      },
    }),
    load: () =>
      pending.resolve(
        new LanguageSupport(
          StreamLanguage.define({
            token: (stream) => {
              stream.skipToEnd();
              return null;
            },
          }),
        ),
      ),
    fail: (error: Error) => pending.reject(error),
  };
}

function Language({
  path,
  onLanguage,
}: {
  path: string;
  onLanguage: (language: ReturnType<typeof useLanguage>) => void;
}) {
  onLanguage(useLanguage(path));
  return null;
}

// Renders `useLanguage` for `path`, and returns its latest result and a way to change the path.
async function mountLanguage(editor: EditorManager, path: string) {
  let latest: ReturnType<typeof useLanguage> | undefined;
  const ui = (path: string) => (
    <EditorManagerContext value={editor}>
      <Language
        path={path}
        onLanguage={(language) => {
          latest = language;
        }}
      />
    </EditorManagerContext>
  );
  const screen = await render(ui(path));
  return { latest: () => latest, path: (path: string) => screen.rerender(ui(path)) };
}

describe('useLanguage', () => {
  test('names language while support loads', async () => {
    const editor = new EditorManager();
    const toy = lateLanguage('Toy', 'toy');
    editor.languages.add([toy.description]);

    const { latest } = await mountLanguage(editor, 'main.toy');

    expect(latest()).toEqual({ name: 'Toy', language: null });
  });

  test('returns description once loaded', async () => {
    const editor = new EditorManager();
    const toy = lateLanguage('Toy', 'toy');
    editor.languages.add([toy.description]);
    const { latest } = await mountLanguage(editor, 'main.toy');

    toy.load();

    await expect.poll(() => latest()?.language).toBe(toy.description);
  });

  test('returns undefined for unmatched path', async () => {
    const { latest } = await mountLanguage(new EditorManager(), 'main.unmatched');

    expect(latest()).toEqual({ name: undefined, language: undefined });
  });

  test('returns undefined once load fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = new EditorManager();
    const toy = lateLanguage('Toy', 'toy');
    editor.languages.add([toy.description]);
    const { latest } = await mountLanguage(editor, 'main.toy');
    const failure = new Error('missing grammar');

    toy.fail(failure);

    await expect.poll(() => latest()).toEqual({ name: 'Toy', language: undefined });
    expect(error).toHaveBeenCalledWith('Language Toy failed to load', failure);
  });

  test('ignores load settling after path change', async () => {
    const editor = new EditorManager();
    const toy = lateLanguage('Toy', 'toy');
    const other = lateLanguage('Other', 'other');
    editor.languages.add([toy.description, other.description]);
    const { latest, path } = await mountLanguage(editor, 'main.toy');
    await path('main.other');

    toy.load();
    await toy.description.load();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(latest()).toEqual({ name: 'Other', language: null });
    other.load();
    await expect.poll(() => latest()?.language).toBe(other.description);
  });

  test('ignores failure after path change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = new EditorManager();
    const toy = lateLanguage('Toy', 'toy');
    const other = lateLanguage('Other', 'other');
    editor.languages.add([toy.description, other.description]);
    const { latest, path } = await mountLanguage(editor, 'main.toy');
    await path('main.other');

    toy.fail(new Error('missing grammar'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await path('main.toy');

    // Loads again, since a failed load is retried.
    expect(latest()).toEqual({ name: 'Toy', language: null });
  });
});
const LAYOUT: EditorDocumentLayout = { type: 'editor' };
const VALUES = Facet.define<string>();

// Returns an extension that sets the content's `data-value` to `value`.
function attribute(value: string): Extension {
  return EditorView.contentAttributes.of({ 'data-value': value });
}

function Plugins({
  view,
  document,
  onPlugins,
}: {
  view: RefObject<EditorView | null>;
  document: EditorDocument | null;
  onPlugins: (plugins: Extension) => void;
}) {
  onPlugins(usePlugins(view, document, LAYOUT));
  return null;
}

// Renders `usePlugins` for `document` without a view, and returns the values its plugins give `VALUES`.
async function pluginValues(editor: EditorManager, document: EditorDocument | null): Promise<readonly string[]> {
  let latest: Extension = [];
  await render(
    <EditorManagerContext value={editor}>
      <Plugins
        view={{ current: null }}
        document={document}
        onPlugins={(plugins) => {
          latest = plugins;
        }}
      />
    </EditorManagerContext>,
  );
  return EditorState.create({ extensions: latest }).facet(VALUES);
}

describe('usePlugins', () => {
  test('includes static entries', async () => {
    const editor = new EditorManager();
    editor.addExtensions([VALUES.of('static')]);

    expect(await pluginValues(editor, null)).toEqual(['static']);
  });

  test('passes document to function entries', async () => {
    const editor = new EditorManager();
    editor.addExtensions([(document) => VALUES.of(document.relativePath)]);

    expect(await pluginValues(editor, { relativePath: 'main.toy', layout: LAYOUT })).toEqual(['main.toy']);
  });

  test('skips function entries without document', async () => {
    const editor = new EditorManager();
    editor.addExtensions([VALUES.of('static'), (document) => VALUES.of(document.relativePath)]);

    expect(await pluginValues(editor, null)).toEqual(['static']);
  });

  test('drops all on throwing entry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = new EditorManager();
    const failure = new Error('broken plugin');
    editor.addExtensions([
      VALUES.of('static'),
      () => {
        throw failure;
      },
    ]);

    expect(await pluginValues(editor, { relativePath: 'main.toy', layout: LAYOUT })).toEqual([]);
    expect(error).toHaveBeenCalledWith('Plugin extension failed', failure);
  });

  test('applies changed plugins to view', async () => {
    const editor = new EditorManager();
    const view = new EditorView({ state: EditorState.create({ extensions: PLUGINS.of([]) }) });
    await render(
      <EditorManagerContext value={editor}>
        <Plugins view={{ current: view }} document={null} onPlugins={() => {}} />
      </EditorManagerContext>,
    );

    editor.addExtensions([attribute('plugin')]);

    await expect.poll(() => view.contentDOM.dataset.value).toBe('plugin');
    view.destroy();
  });
});

describe('applyPlugins', () => {
  test('falls back to none on throwing plugin', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = new EditorView({ state: EditorState.create({ extensions: PLUGINS.of(attribute('one')) }) });
    const failure = new Error('broken');
    const broken = StateField.define({
      create: () => {
        throw failure;
      },
      update: (value) => value,
    });

    applyPlugins(view, [attribute('two'), broken]);

    expect(view.contentDOM.dataset.value).toBeUndefined();
    expect(error).toHaveBeenCalledWith('Plugin extension failed', failure);
    view.destroy();
  });
});
const COMPARTMENT = new Compartment();

function Compartmented({ view, value }: { view: RefObject<EditorView | null>; value: Extension }) {
  useCompartment(view, COMPARTMENT, value);
  return null;
}

describe('useCompartment', () => {
  test('reconfigures view on change', async () => {
    const view = new EditorView({ state: EditorState.create({ extensions: COMPARTMENT.of(attribute('one')) }) });
    const ref = { current: view };
    const screen = await render(<Compartmented view={ref} value={attribute('two')} />);

    await screen.rerender(<Compartmented view={ref} value={attribute('three')} />);

    expect(view.contentDOM.dataset.value).toBe('three');
    view.destroy();
  });

  test('skips missing view', async () => {
    const view = new EditorView({ state: EditorState.create({ extensions: COMPARTMENT.of(attribute('one')) }) });
    const ref: RefObject<EditorView | null> = { current: null };
    const screen = await render(<Compartmented view={ref} value={attribute('two')} />);
    ref.current = view;

    await screen.rerender(<Compartmented view={ref} value={attribute('three')} />);

    expect(view.contentDOM.dataset.value).toBe('three');
    view.destroy();
  });

  test('skips unchanged value', async () => {
    const view = new EditorView({ state: EditorState.create({ extensions: COMPARTMENT.of(attribute('one')) }) });
    const dispatch = vi.spyOn(view, 'dispatch');
    const ref = { current: view };
    const value = attribute('two');
    const screen = await render(<Compartmented view={ref} value={value} />);

    await screen.rerender(<Compartmented view={ref} value={value} />);

    expect(dispatch).toHaveBeenCalledTimes(1);
    view.destroy();
  });
});
