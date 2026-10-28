import { startCompletion } from '@codemirror/autocomplete';
import { indentUnit, LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type DiffLayout, type Settings } from '@elsewise/bridge';
import {
  DEFAULT_COMMANDS,
  DEFAULT_DIFF_SOURCES,
  EDITOR_DOCUMENT,
  type EditorDiffContent,
  type EditorDiffSource,
  type LanguageServer,
} from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { DiffState } from '@/editor/diff/diff';
import { Editor } from '@/editor/editor';
import { COMMANDS, EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../test/commands';
import { StubTransport } from '../../test/stub-transport';

const { EDITOR } = vi.hoisted(() => ({
  EDITOR: {
    searchMatch: '#A1B2C3',
    searchMatchSelected: '#00000000',
    searchMatchSelectedBorder: '#C3B2A1',
    tokens: {
      keyword: { color: '#A0B0C0', bold: true, strikethrough: true },
      comment: { color: '#D0E0F0', italic: true, underline: true },
    },
  },
}));

// Replaces the editor's colors with test colors, since a test cannot add a theme to the bundled ones.
vi.mock('@/appearance/themes', async (original) => {
  const actual = await original<typeof import('@/appearance/themes')>();
  const elsewise = actual.resolveActiveTheme(actual.THEMES, { source: 'elsewise', name: 'elsewise' }, 'light');
  // The same object on every call, as the real hook returns while the theme stays the same.
  const theme = { ...elsewise, editor: { ...elsewise.editor, ...EDITOR } };
  return { ...actual, useActiveTheme: () => theme };
});

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: {
    ...DEFAULT_SETTINGS.appearance,
    general: { ...DEFAULT_SETTINGS.appearance.general, brightness: 'light' },
    editor: { ...DEFAULT_SETTINGS.appearance.editor, visualGuides: [] },
  },
};

function shell(children: ReactNode) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, SETTINGS);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function mountEditor(
  code: string,
  path = 'main.rs',
  editor = new EditorManager(),
  root?: URL,
): Promise<EditorView> {
  const commands = new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
  });
  const screen = await render(
    shell(
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={new LanguageServers(editor)}>
            <div style={{ height: 300 }}>
              <Editor
                content={{ label: 'Current', code }}
                relativePath={path}
                root={root}
                diff={new DiffState(null, 'unified')}
              />
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>,
    ),
  );
  await expect.element(screen.getByText(code.split('\n')[0])).toBeVisible();
  const view = EditorView.findFromDOM(screen.container.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('missing editor');
  }
  return view;
}

function style(el: Element | null): CSSStyleDeclaration {
  if (el === null) {
    throw new Error('missing element');
  }
  return getComputedStyle(el);
}

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

// Returns a language for files with `extensions` that highlights every line as a comment.
function commentLanguage(extensions: string[]): LanguageDescription {
  return LanguageDescription.of({
    name: 'Comment',
    extensions,
    load: async () =>
      new LanguageSupport(
        StreamLanguage.define({
          token: (stream) => {
            stream.skipToEnd();
            return 'comment';
          },
        }),
      ),
  });
}

// Returns a language server for Rust files that only responds to `initialize`, and the messages it was sent.
function rustServer(): { server: LanguageServer; sent: StubTransport['sent'] } {
  const transport = new StubTransport();
  return {
    sent: transport.sent,
    server: { id: 'rust', name: 'Rust', languages: { Rust: 'rust' }, start: () => transport },
  };
}

// Returns the color of the first token on the first line, once there is one.
function firstTokenColor(view: EditorView): string | undefined {
  const token = view.contentDOM.querySelector('.cm-line span');
  return token === null ? undefined : getComputedStyle(token).color;
}

// A plugin's extension adding a hover section reading `text` over the whole document, in every language.
function blame(text: string): Extension {
  const section = {
    source: (view: EditorView) => ({
      pos: 0,
      end: view.state.doc.length,
      create: () => ({ dom: Object.assign(document.createElement('div'), { className: 'blame', textContent: text }) }),
    }),
  };
  return EditorState.languageData.of(() => [{ hover: section }]);
}

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('\n');
// Changes `beta` on line 2 and deletes `delta`.
const CODE = ['alpha', 'BETA', 'gamma', 'epsilon'].join('\n');

afterEach(() => {
  vi.restoreAllMocks();
});

// Returns a source with `id` whose base is `base`.
function diffSourceOf(id: string, base: string | Promise<string>): EditorDiffSource {
  return { id, label: id, base: async () => ({ code: await base }) };
}

// Mounts `CODE` diffed against the source with `source` in `layout`, and returns the diff state, the editor of the file
// and the base side's editor.
async function mountDiff(source: string | null, layout: DiffLayout, editor = new EditorManager()) {
  const diff = new DiffState(source, layout);
  const commands = new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
  });
  const screen = await render(
    shell(
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={new LanguageServers(editor)}>
            <div style={{ height: 300 }}>
              <Editor content={{ label: 'Current', code: CODE }} relativePath="main.txt" diff={diff} />
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>,
    ),
  );
  await expect.element(screen.getByText('alpha').first()).toBeVisible();
  const find = (selector: string) => {
    const element = screen.container.querySelector(selector);
    return element instanceof HTMLElement ? EditorView.findFromDOM(element) : null;
  };
  return {
    diff,
    commands,
    file: () => find('.cm-mergeView .cm-merge-b') ?? find('.cm-editor'),
    base: () => find('.cm-mergeView .cm-merge-a'),
  };
}

// Returns a source with `id` whose base resolves or rejects when the returned functions are called.
function pendingSourceOf(id: string) {
  let resolve = (_: EditorDiffContent) => {};
  let reject = (_: Error) => {};
  const source: EditorDiffSource = {
    id,
    label: id,
    base: () =>
      new Promise<EditorDiffContent>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      }),
  };
  return { source, resolve: (base: string) => resolve({ code: base }), reject: (error: Error) => reject(error) };
}

describe('Editor', () => {
  test('colors search matches from theme', async () => {
    const view = await mountEditor('a a a\n');
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'a' })) });
    findNext(view);

    const marks = [...view.dom.querySelectorAll('.cm-searchMatch')];
    expect(marks).toHaveLength(3);
    const current = style(view.dom.querySelector('.cm-searchMatch-selected'));
    const other = style(marks.find((mark) => !mark.classList.contains('cm-searchMatch-selected')) ?? null);
    expect(other.backgroundColor).toBe(rgb(EDITOR.searchMatch));
    expect(current.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(current.outlineColor).toBe(rgb(EDITOR.searchMatchSelectedBorder));
    expect(current.outlineStyle).toBe('solid');
    expect(current.outlineWidth).toBe('1px');
    expect(current.outlineOffset).toBe('0px');
  });

  test('shows tooltips above search bar', async () => {
    const view = await mountEditor('fn main() {}\n');
    openSearchPanel(view);
    await userEvent.hover(page.getByRole('button', { name: 'Next match' }));

    const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');
    await expect.poll(tooltip).not.toBeNull();
    const { left, top, width, height } = (tooltip() as Element).getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    expect(tooltip()?.contains(hit)).toBe(true);
  });

  test('draws fold marker from icon set', async () => {
    const view = await mountEditor('fn main() {\n    let a = 1;\n}\n');
    await expect.poll(() => view.dom.querySelector('.cm-fold-marker')).not.toBeNull();
    expect(style(view.dom.querySelector('.cm-fold-marker')).maskImage).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  test('applies plugin theme over metrics', async () => {
    const editor = new EditorManager();
    editor.addExtensions([EditorView.theme({ '.cm-content': { paddingBottom: '0px' } })]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    expect(style(view.contentDOM).paddingBottom).toBe('0px');
  });

  test('prefers settings over plugin indentation facets', async () => {
    const editor = new EditorManager();
    editor.addExtensions([EditorState.tabSize.of(2), indentUnit.of('\t')]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    expect(view.state.tabSize).toBe(SETTINGS.appearance.editor.tabSize);
    expect(view.state.facet(indentUnit)).toBe(SETTINGS.appearance.editor.indentUnit);
  });

  test('prefers file line separator over plugin facet', async () => {
    const editor = new EditorManager();
    editor.addExtensions([EditorState.lineSeparator.of('\r\n')]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    expect(view.state.lineBreak).toBe('\n');
  });

  test('passes file to plugin extension function', async () => {
    const editor = new EditorManager();
    editor.addExtensions([(document) => EditorView.contentAttributes.of({ 'data-path': document.relativePath })]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    expect(view.contentDOM.dataset.path).toBe('main.rs');
  });

  test('provides file to plugin extension in state', async () => {
    const editor = new EditorManager();
    editor.addExtensions([
      EditorView.contentAttributes.compute([EDITOR_DOCUMENT], (state) => {
        const document = state.facet(EDITOR_DOCUMENT);
        return { 'data-file': document === null ? 'loading' : `${document.relativePath} ${document.layout.type}` };
      }),
    ]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    await expect.poll(() => view.contentDOM.dataset.file).toBe('main.rs editor');
  });

  test('passes loaded language to plugin extension function', async () => {
    const editor = new EditorManager();
    editor.addExtensions([
      ({ language }) =>
        EditorView.contentAttributes.of({
          'data-language': `${language?.name} ${language?.support?.language.name}`,
        }),
    ]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    await expect.poll(() => view.contentDOM.dataset.language).toBe('Rust rust');
  });

  test('applies plain plugin extension before language loads', async () => {
    const editor = new EditorManager();
    editor.addExtensions([
      EditorView.contentAttributes.of({ 'data-plain': '' }),
      ({ language }) => EditorView.contentAttributes.of({ 'data-language': String(language?.name) }),
    ]);
    const view = await mountEditor('func main() {}\n', 'main.go', editor);

    expect(view.contentDOM.dataset.plain).toBe('');
    expect(view.contentDOM.dataset.language).toBeUndefined();
    await expect.poll(() => view.contentDOM.dataset.language).toBe('Go');
  });

  test('passes no language for unknown file to plugin extension function', async () => {
    const editor = new EditorManager();
    editor.addExtensions([
      ({ language }) => EditorView.contentAttributes.of({ 'data-language': String(language?.name) }),
    ]);
    const view = await mountEditor('fn main() {}\n', 'main.unknown', editor);

    expect(view.contentDOM.dataset.language).toBe('undefined');
  });

  test('shows plugin completions without language server', async () => {
    const editor = new EditorManager();
    const options = [{ label: 'main', type: 'function' }];
    editor.addExtensions([EditorState.languageData.of(() => [{ autocomplete: options }])]);
    const view = await mountEditor('ma\n', 'main.rs', editor);
    view.dispatch({ selection: { anchor: 2 } });
    view.focus();

    startCompletion(view);

    await expect.element(page.getByRole('option').getByText('main')).toBeVisible();
  });

  test('shows plugin hover section without language server', async () => {
    const editor = new EditorManager();
    editor.addExtensions([blame('You, yesterday')]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

    const { left, top, bottom } = view.coordsAtPos(4) as DOMRect;
    const [x, y] = [left + 1, (top + bottom) / 2];
    document
      .elementFromPoint(x, y)
      ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));

    await expect
      .poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent, { timeout: 2000 })
      .toBe('You, yesterday');
  });

  test('drops disposed plugin hover section', async () => {
    const editor = new EditorManager();
    const dispose = editor.addExtensions([blame('You, yesterday')]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
    view.dispatch({ selection: { anchor: 4 } });
    const show = () => view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);
    show();
    await expect.poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')).not.toBeNull();

    dispose();
    // Waits for the editor to drop the plugin's extensions, which it does on its next render.
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.dispatch({ selection: { anchor: 3 } });
    show();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(view.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('shows plugin hover section on quick documentation', async () => {
    const editor = new EditorManager();
    editor.addExtensions([blame('You, yesterday')]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
    view.dispatch({ selection: { anchor: 4 } });

    view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);

    await expect.poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent).toBe('You, yesterday');
  });

  test('limits language hover section to language files', async () => {
    const editor = new EditorManager();
    const language = StreamLanguage.define({
      token: (stream) => {
        stream.skipToEnd();
        return 'comment';
      },
    });
    const section = {
      source: (view: EditorView) => ({
        pos: 0,
        end: view.state.doc.length,
        create: () => ({ dom: Object.assign(document.createElement('div'), { className: 'blame' }) }),
      }),
    };
    editor.languages.add([
      LanguageDescription.of({
        name: 'Comment',
        extensions: ['comment'],
        support: new LanguageSupport(language, language.data.of({ hover: section })),
      }),
    ]);
    const show = (view: EditorView) => {
      view.dispatch({ selection: { anchor: 2 } });
      view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);
    };

    const comment = await mountEditor('hello\n', 'main.comment', editor);
    show(comment);
    await expect.poll(() => comment.dom.querySelector('.cm-tooltip-hover .blame')).not.toBeNull();

    const rust = await mountEditor('fn main() {}\n', 'main.rs', editor);
    show(rust);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(rust.dom.querySelector('.cm-tooltip-hover')).toBeNull();
  });

  test('highlights files by plugin language extension', async () => {
    const editor = new EditorManager();
    editor.languages.add([commentLanguage(['comment'])]);
    const view = await mountEditor('hello\n', 'main.comment', editor);

    await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));
  });

  test('prefers plugin language over built-in until disposed', async () => {
    const editor = new EditorManager();
    const dispose = editor.languages.add([commentLanguage(['rs'])]);
    const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
    await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));

    dispose();
    await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.keyword.color));
  });

  test('opens file on plugin language server', async () => {
    const editor = new EditorManager();
    const { server, sent } = rustServer();
    editor.languages.addServers([server]);
    await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));

    await expect
      .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
      .toMatchObject({
        params: { textDocument: { uri: 'file:///worktree/src/main.rs', languageId: 'rust', text: 'fn main() {}\n' } },
      });
    expect(sent[0]).toMatchObject({ method: 'initialize', params: { rootUri: 'file:///worktree/' } });
  });

  test('opens file on later-added language server', async () => {
    const editor = new EditorManager();
    const { server, sent } = rustServer();
    await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));
    editor.languages.addServers([server]);

    await expect
      .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
      .toMatchObject({ params: { textDocument: { uri: 'file:///worktree/src/main.rs' } } });
  });

  test('keeps file open on adding other language server', async () => {
    const editor = new EditorManager();
    const { server, sent } = rustServer();
    editor.languages.addServers([server]);
    await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));
    await expect.poll(() => sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);

    editor.languages.addServers([{ ...rustServer().server, id: 'toy', languages: { Toy: 'toy' } }]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);
  });

  test('skips language server without root', async () => {
    const editor = new EditorManager();
    const { server, sent } = rustServer();
    editor.languages.addServers([server]);
    await mountEditor('fn main() {}\n', 'src/main.rs', editor);
    await new Promise((resolve) => setTimeout(resolve));

    expect(sent).toEqual([]);
  });

  describe('diff', () => {
    test('shows chunks once base arrives', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE)]);
      const { file } = await mountDiff('test.source', 'unified', editor);

      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);
      expect(file()?.dom.querySelector('.cm-deletedChunk .cm-deletedLine')?.textContent).toBe('beta');
    });

    test('clears source and chunks on close', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE)]);
      const { diff, file, commands } = await mountDiff('test.source', 'unified', editor);
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);

      commands.run(DEFAULT_COMMANDS.editor.diff.close, file() ?? undefined);

      expect(diff.source).toBeNull();
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
    });

    test('fetches base of changed source', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE), diffSourceOf('test.other', CODE)]);
      const { diff, file } = await mountDiff('test.source', 'unified', editor);
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);

      diff.source = 'test.other';

      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
    });

    test('drops base arriving after source change', async () => {
      const editor = new EditorManager();
      let resolveLate!: (base: string) => void;
      const late = new Promise<string>((resolve) => {
        resolveLate = resolve;
      });
      editor.diffs.add([diffSourceOf('test.late', late), diffSourceOf('test.other', CODE)]);
      const { diff, file } = await mountDiff('test.late', 'unified', editor);

      diff.source = 'test.other';
      await expect.poll(() => file()?.dom.querySelector('.cm-deletedChunk')).toBeNull();
      resolveLate(BASE);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
    });

    test('shows read-only base beside file in split', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE)]);
      const { file, base } = await mountDiff('test.source', 'split', editor);

      await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);
      expect(base()?.state.readOnly).toBe(true);
      expect(file()?.state.doc.toString()).toBe(CODE);
      expect(file()?.state.readOnly).toBe(false);
    });

    test('keeps document, selection and undo history across layouts', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE)]);
      const { diff, file, base, commands } = await mountDiff('test.source', 'unified', editor);
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);
      file()?.dispatch({ changes: { from: 0, insert: 'x' }, selection: { anchor: 3 }, userEvent: 'input' });

      commands.run(DEFAULT_COMMANDS.editor.diff.split, file() ?? undefined);

      expect(diff.layout).toBe('split');
      await expect.poll(() => base()).not.toBeNull();
      expect(file()?.state.doc.toString()).toBe(`x${CODE}`);
      expect(file()?.state.selection.main.head).toBe(3);
      commands.run(DEFAULT_COMMANDS.editor.history.undo, file() ?? undefined);
      expect(file()?.state.doc.toString()).toBe(CODE);

      commands.run(DEFAULT_COMMANDS.editor.diff.unified, file() ?? undefined);

      await expect.poll(() => base()).toBeNull();
      commands.run(DEFAULT_COMMANDS.editor.history.redo, file() ?? undefined);
      expect(file()?.state.doc.toString()).toBe(`x${CODE}`);
    });

    test('replaces base of changed source in split', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE), diffSourceOf('test.other', CODE)]);
      const { diff, base } = await mountDiff('test.source', 'split', editor);
      await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);

      diff.source = 'test.other';

      await expect.poll(() => base()?.state.doc.toString()).toBe(CODE);
    });

    test('passes side layout to plugin extension function', async () => {
      const editor = new EditorManager();
      editor.diffs.add([diffSourceOf('test.source', BASE)]);
      editor.addExtensions([
        (document) =>
          EditorView.contentAttributes.of({
            'data-layout': document.layout.type === 'split' ? `split ${document.layout.side}` : document.layout.type,
          }),
      ]);
      const { file, base, commands } = await mountDiff('test.source', 'unified', editor);

      await expect.poll(() => file()?.contentDOM.dataset.layout).toBe('unified');
      commands.run(DEFAULT_COMMANDS.editor.diff.split, file() ?? undefined);

      await expect.poll(() => file()?.contentDOM.dataset.layout).toBe('split target');
      expect(base()?.contentDOM.dataset.layout).toBe('split base');
    });

    test('keeps split while new base loads', async () => {
      const editor = new EditorManager();
      const other = pendingSourceOf('test.other');
      editor.diffs.add([diffSourceOf('test.source', BASE), other.source]);
      const { diff, file, base } = await mountDiff('test.source', 'split', editor);
      await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);
      const shown = file();

      diff.source = 'test.other';
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(base()?.state.doc.toString()).toBe(BASE);
      expect(file()).toBe(shown);
      other.resolve(CODE);
      await expect.poll(() => base()?.state.doc.toString()).toBe(CODE);
      expect(file()).toBe(shown);
    });

    test('keeps unified diff while new base loads', async () => {
      const editor = new EditorManager();
      const other = pendingSourceOf('test.other');
      editor.diffs.add([diffSourceOf('test.source', BASE), other.source]);
      const { diff, file } = await mountDiff('test.source', 'unified', editor);
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);

      diff.source = 'test.other';
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);
      other.resolve(CODE);
      await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
    });

    test('replaces editor with why base failed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const editor = new EditorManager();
      const failing = pendingSourceOf('test.failing');
      editor.diffs.add([diffSourceOf('test.source', BASE), failing.source]);
      const { diff, file } = await mountDiff('test.source', 'split', editor);
      await expect.poll(() => file()).not.toBeNull();

      diff.source = 'test.failing';
      // Waits for the editor to ask for the base.
      await new Promise((resolve) => setTimeout(resolve, 50));
      failing.reject(new Error('unreadable'));

      await expect.element(page.getByText('Could not show the diff')).toBeVisible();
      await expect.element(page.getByText('unreadable')).toBeVisible();
      expect(file()).toBeNull();
      expect(header()).toBeNull();
    });

    test('closes failed base back to editor', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const editor = new EditorManager();
      const failing = pendingSourceOf('test.failing');
      editor.diffs.add([failing.source]);
      const { diff, file } = await mountDiff('test.failing', 'unified', editor);
      failing.reject(new Error('unreadable'));
      await expect.element(page.getByText('unreadable')).toBeVisible();

      await userEvent.click(page.getByRole('button', { name: 'Stop comparing' }));

      await expect.poll(() => diff.source).toBeNull();
      await expect.poll(() => file()).not.toBeNull();
      await expect.element(page.getByRole('button', { name: 'Compare with…' })).toBeVisible();
    });

    test('stops on removed source', async () => {
      const editor = new EditorManager();
      const remove = editor.diffs.add([diffSourceOf('test.source', BASE)]);
      const { file, base } = await mountDiff('test.source', 'split', editor);
      await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);

      remove();

      await expect.poll(() => base()).toBeNull();
      expect(file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
    });

    test('updates toolbar command while base loads', async () => {
      const editor = new EditorManager();
      editor.diffs.add([pendingSourceOf('test.source').source]);
      editor.addToolbarItems([
        {
          type: 'command',
          command: DEFAULT_COMMANDS.editor.diff.split,
          icon: (props) => <svg {...props} data-testid="split" />,
        },
      ]);
      const { diff } = await mountDiff('test.source', 'unified', editor);
      const split = page.getByTestId('split');
      await expect.element(split).toBeInTheDocument();
      // Waits for the updates of the view's first measurements.
      await new Promise((resolve) => setTimeout(resolve, 100));

      diff.source = null;

      await expect.poll(() => split.query()).toBeNull();
    });

    test('starts comparing from toolbar', async () => {
      const editor = new EditorManager();
      editor.diffs.add(builtInSources());
      const { diff } = await mountDiff(null, 'unified', editor);

      await userEvent.click(page.getByRole('button', { name: 'Compare with…' }));
      await userEvent.click(page.getByRole('menuitemradio', { name: 'Unstaged' }));

      await expect.poll(() => diff.source).toBe(DEFAULT_DIFF_SOURCES.unstaged);
      await expect.element(page.getByRole('button', { name: 'Compared with Unstaged' })).toBeVisible();
      expect(page.getByRole('button', { name: 'Compare with…' }).query()).toBeNull();
    });
  });
});

// Returns the header over a diff, if one is shown.
function header(): Element | null {
  return document.querySelector('[data-slot="diff-header"]');
}

// Returns sources with the built-in ids, whose bases are `BASE`, named after their content where `label` is given.
function builtInSources(label?: string): EditorDiffSource[] {
  return [
    { id: DEFAULT_DIFF_SOURCES.unstaged, label: 'Unstaged', base: async () => ({ code: BASE, label }) },
    { id: DEFAULT_DIFF_SOURCES.uncommitted, label: 'Uncommitted', base: async () => ({ code: BASE }) },
  ];
}

describe('DiffHeader', () => {
  test('names base and target', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources('HEAD (a1b2c3d)'));
    await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

    await expect.poll(() => header()?.textContent).toContain('HEAD (a1b2c3d)');
    expect(header()?.textContent).toContain('Current');
  });

  test('switches source', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    const { diff } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

    await userEvent.click(page.getByRole('button', { name: 'Compared with Unstaged' }));
    await expect.element(page.getByRole('menuitemradio', { name: 'Unstaged' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(page.getByRole('menuitemradio', { name: 'Uncommitted' }));

    await expect.poll(() => diff.source).toBe(DEFAULT_DIFF_SOURCES.uncommitted);
    await expect.element(page.getByRole('button', { name: 'Compared with Uncommitted' })).toBeVisible();
  });

  test('lists sources', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

    await userEvent.click(page.getByRole('button', { name: 'Compared with Unstaged' }));

    await expect.element(page.getByRole('menuitemradio', { name: 'Unstaged' })).toBeVisible();
    expect(
      page
        .getByRole('menuitemradio')
        .elements()
        .map((element) => element.textContent),
    ).toEqual(['Unstaged', 'Uncommitted']);
    expect(page.getByRole('menuitem').query()).toBeNull();
  });

  test('skips hidden sources', async () => {
    const editor = new EditorManager();
    editor.diffs.add([
      ...builtInSources(),
      { id: 'test.hidden', label: 'Hidden', shown: () => false, base: async () => ({ code: BASE }) },
    ]);
    await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

    await userEvent.click(page.getByRole('button', { name: 'Compared with Unstaged' }));

    await expect.element(page.getByRole('menuitemradio', { name: 'Uncommitted' })).toBeVisible();
    expect(page.getByRole('menuitemradio', { name: 'Hidden' }).query()).toBeNull();
  });

  test('goes to next and previous change', async () => {
    const editor = new EditorManager();
    editor.diffs.add([diffSourceOf(DEFAULT_DIFF_SOURCES.unstaged, BASE)]);
    const { file } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
    const line = () => {
      const state = file()?.state;
      return state?.doc.lineAt(state.selection.main.head).number;
    };
    await expect.element(page.getByRole('button', { name: 'Next change' })).toBeEnabled();

    await userEvent.click(page.getByRole('button', { name: 'Next change' }));
    await expect.poll(line).toBe(2);
    await userEvent.click(page.getByRole('button', { name: 'Next change' }));
    await expect.poll(line).toBe(4);
    await userEvent.click(page.getByRole('button', { name: 'Previous change' }));
    await expect.poll(line).toBe(2);
  });

  test('disables change buttons without changes', async () => {
    const editor = new EditorManager();
    editor.diffs.add([diffSourceOf(DEFAULT_DIFF_SOURCES.unstaged, CODE)]);
    const { file } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
    await expect.element(page.getByRole('button', { name: 'Next change' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeDisabled();

    file()?.dispatch({ changes: { from: 0, insert: 'omega\n' } });

    await expect.element(page.getByRole('button', { name: 'Next change' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeEnabled();
  });

  test('enables change buttons in split', async () => {
    const editor = new EditorManager();
    editor.diffs.add([diffSourceOf(DEFAULT_DIFF_SOURCES.unstaged, BASE)]);
    await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'split', editor);

    await expect.element(page.getByRole('button', { name: 'Next change' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeEnabled();
  });

  test('switches layout', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    const { diff, base } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
    await expect.element(page.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(page.getByRole('button', { name: 'Split' }));

    await expect.poll(() => diff.layout).toBe('split');
    await expect.poll(() => base()).not.toBeNull();
    await expect.element(page.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByRole('button', { name: 'Split' })).toBeEnabled();
    await expect.element(page.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('stops comparing', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    const { diff } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
    await expect.poll(() => header()).not.toBeNull();

    await userEvent.click(page.getByRole('button', { name: 'Close comparison' }));

    await expect.poll(() => diff.source).toBeNull();
    await expect.poll(() => header()).toBeNull();
    await expect.element(page.getByRole('button', { name: 'Compare with…' })).toBeVisible();
  });

  test('follows resized sides in split', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    const { base } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'split', editor);
    await expect.poll(() => base()).not.toBeNull();
    const handle = document.querySelector('[data-slot="split-handle"]') as HTMLElement;
    const left = base()?.dom.getBoundingClientRect().left ?? 0;

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: left + 300, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: left + 250 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: left + 250 }));

    const half = () => header()?.firstElementChild?.getBoundingClientRect().width;
    const side = () => base()?.dom.closest('.cm-mergeViewEditor')?.getBoundingClientRect().width;
    await expect.poll(side).toBeCloseTo(250, -1);
    expect(half()).toBeCloseTo(side() ?? 0, 0);
  });

  test('lines up with sides in split', async () => {
    const editor = new EditorManager();
    editor.diffs.add(builtInSources());
    const { file, base } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'split', editor);
    await expect.poll(() => base()).not.toBeNull();

    const picker = page.getByRole('button', { name: 'Compared with Unstaged' }).element().getBoundingClientRect();
    const target = page.getByText('Current').element().getBoundingClientRect();
    const left = base()?.dom.getBoundingClientRect();
    const right = file()?.dom.getBoundingClientRect();

    expect(picker.left).toBeGreaterThanOrEqual(left?.left ?? Number.NaN);
    expect(picker.right).toBeLessThanOrEqual(left?.right ?? Number.NaN);
    expect(target.left).toBeGreaterThanOrEqual(right?.left ?? Number.NaN);
  });
});
