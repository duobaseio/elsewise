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
import { expect, test, vi } from 'vitest';
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

// Returns a language server for Rust files that only answers `initialize`, and the messages it was sent.
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

test('search match roles', async () => {
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

test('tooltips above search bar', async () => {
  const view = await mountEditor('fn main() {}\n');
  openSearchPanel(view);
  await userEvent.hover(page.getByRole('button', { name: 'Next match' }));

  const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');
  await expect.poll(tooltip).not.toBeNull();
  const { left, top, width, height } = (tooltip() as Element).getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  expect(tooltip()?.contains(hit)).toBe(true);
});

test('fold marker is drawn from icon set', async () => {
  const view = await mountEditor('fn main() {\n    let a = 1;\n}\n');
  await expect.poll(() => view.dom.querySelector('.cm-fold-marker')).not.toBeNull();
  expect(style(view.dom.querySelector('.cm-fold-marker')).maskImage).toMatch(/^url\("data:image\/svg\+xml,/);
});

test("plugin's theme overrides editor's metrics", async () => {
  const editor = new EditorManager();
  editor.addExtensions([EditorView.theme({ '.cm-content': { paddingBottom: '0px' } })]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  expect(style(view.contentDOM).paddingBottom).toBe('0px');
});

test('settings beat plugin indentation facets', async () => {
  const editor = new EditorManager();
  editor.addExtensions([EditorState.tabSize.of(2), indentUnit.of('\t')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  expect(view.state.tabSize).toBe(SETTINGS.appearance.editor.tabSize);
  expect(view.state.facet(indentUnit)).toBe(SETTINGS.appearance.editor.indentUnit);
});

test('file line separator beats plugin facet', async () => {
  const editor = new EditorManager();
  editor.addExtensions([EditorState.lineSeparator.of('\r\n')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  expect(view.state.lineBreak).toBe('\n');
});

test("plugin's extension function receives file", async () => {
  const editor = new EditorManager();
  editor.addExtensions([(document) => EditorView.contentAttributes.of({ 'data-path': document.relativePath })]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  expect(view.contentDOM.dataset.path).toBe('main.rs');
});

test("plugin's extension reads file from state", async () => {
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

test("plugin's extension function receives loaded language", async () => {
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

test("plugin's plain extension applies before language loads", async () => {
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

test("plugin's extension function receives no language for unknown file", async () => {
  const editor = new EditorManager();
  editor.addExtensions([
    ({ language }) => EditorView.contentAttributes.of({ 'data-language': String(language?.name) }),
  ]);
  const view = await mountEditor('fn main() {}\n', 'main.unknown', editor);

  expect(view.contentDOM.dataset.language).toBe('undefined');
});

test("plugin's completions show without language server", async () => {
  const editor = new EditorManager();
  const options = [{ label: 'main', type: 'function' }];
  editor.addExtensions([EditorState.languageData.of(() => [{ autocomplete: options }])]);
  const view = await mountEditor('ma\n', 'main.rs', editor);
  view.dispatch({ selection: { anchor: 2 } });
  view.focus();

  startCompletion(view);

  await expect.element(page.getByRole('option').getByText('main')).toBeVisible();
});

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

// Moves the pointer over `pos` in `view`.
function point(view: EditorView, pos: number): void {
  const { left, top, bottom } = view.coordsAtPos(pos) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

test("plugin's hover section shows without language server", async () => {
  const editor = new EditorManager();
  editor.addExtensions([blame('You, yesterday')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  point(view, 4);

  await expect
    .poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent, { timeout: 2000 })
    .toBe('You, yesterday');
});

test("plugin's hover section goes once disposed", async () => {
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

test("plugin's hover section shows on quick documentation", async () => {
  const editor = new EditorManager();
  editor.addExtensions([blame('You, yesterday')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
  view.dispatch({ selection: { anchor: 4 } });

  view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);

  await expect.poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent).toBe('You, yesterday');
});

test("plugin's hover section on language shows in its files only", async () => {
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

test("plugin's language highlights files with extension", async () => {
  const editor = new EditorManager();
  editor.languages.add([commentLanguage(['comment'])]);
  const view = await mountEditor('hello\n', 'main.comment', editor);

  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));
});

test("plugin's language beats built-in until disposed", async () => {
  const editor = new EditorManager();
  const dispose = editor.languages.add([commentLanguage(['rs'])]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));

  dispose();
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.keyword.color));
});

test("plugin's language server opens files in language", async () => {
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

test("plugin's language server opens files opened before it", async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));
  editor.languages.addServers([server]);

  await expect
    .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
    .toMatchObject({ params: { textDocument: { uri: 'file:///worktree/src/main.rs' } } });
});

test("plugin's language server keeps file open when another language's server is added", async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  editor.languages.addServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));
  await expect.poll(() => sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);

  editor.languages.addServers([{ ...rustServer().server, id: 'toy', languages: { Toy: 'toy' } }]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);
});

test('file without root has no language server', async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  editor.languages.addServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', editor);
  await new Promise((resolve) => setTimeout(resolve));

  expect(sent).toEqual([]);
});

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('\n');
// Changes `beta` on line 2 and deletes `delta`.
const CODE = ['alpha', 'BETA', 'gamma', 'epsilon'].join('\n');

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

test('diff shows chunks once base arrives', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf('test.source', BASE)]);
  const { file } = await mountDiff('test.source', 'unified', editor);

  await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);
  expect(file()?.dom.querySelector('.cm-deletedChunk .cm-deletedLine')?.textContent).toBe('beta');
});

test('stopping diff clears source and removes chunks', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf('test.source', BASE)]);
  const { diff, file, commands } = await mountDiff('test.source', 'unified', editor);
  await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);

  commands.run(DEFAULT_COMMANDS.editor.diff.close, file() ?? undefined);

  expect(diff.source).toBeNull();
  await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
});

test('changed source fetches base', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf('test.source', BASE), diffSourceOf('test.other', CODE)]);
  const { diff, file } = await mountDiff('test.source', 'unified', editor);
  await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(1);

  diff.source = 'test.other';

  await expect.poll(() => file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
});

test('base that arrives after source changed is dropped', async () => {
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

test('split shows read-only base beside file', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf('test.source', BASE)]);
  const { file, base } = await mountDiff('test.source', 'split', editor);

  await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);
  expect(base()?.state.readOnly).toBe(true);
  expect(file()?.state.doc.toString()).toBe(CODE);
  expect(file()?.state.readOnly).toBe(false);
});

test('switching layouts keeps document, selection and undo history', async () => {
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

test('changed source replaces base in split', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf('test.source', BASE), diffSourceOf('test.other', CODE)]);
  const { diff, base } = await mountDiff('test.source', 'split', editor);
  await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);

  diff.source = 'test.other';

  await expect.poll(() => base()?.state.doc.toString()).toBe(CODE);
});

test('plugin extension function receives side layout', async () => {
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

test('split stays while new base loads', async () => {
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

test('inline diff stays while new base loads', async () => {
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

test('failed base stops showing diff', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const editor = new EditorManager();
  const other = pendingSourceOf('test.other');
  editor.diffs.add([diffSourceOf('test.source', BASE), other.source]);
  const { diff, file, base } = await mountDiff('test.source', 'split', editor);
  await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);

  diff.source = 'test.other';
  await new Promise((resolve) => setTimeout(resolve, 50));
  other.reject(new Error('unreadable'));

  await expect.poll(() => base()).toBeNull();
  expect(file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
});

test('removed source stops showing diff', async () => {
  const editor = new EditorManager();
  const remove = editor.diffs.add([diffSourceOf('test.source', BASE)]);
  const { file, base } = await mountDiff('test.source', 'split', editor);
  await expect.poll(() => base()?.state.doc.toString()).toBe(BASE);

  remove();

  await expect.poll(() => base()).toBeNull();
  expect(file()?.dom.querySelectorAll('.cm-changedLine').length).toBe(0);
});

test('toolbar command updates while base loads', async () => {
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

test('toolbar compare starts comparing', async () => {
  const editor = new EditorManager();
  editor.diffs.add(builtInSources());
  const { diff } = await mountDiff(null, 'unified', editor);

  await userEvent.click(page.getByRole('button', { name: 'Compare with…' }));
  await userEvent.click(page.getByRole('menuitemradio', { name: 'Unstaged' }));

  await expect.poll(() => diff.source).toBe(DEFAULT_DIFF_SOURCES.unstaged);
  await expect.element(page.getByRole('button', { name: 'Compared with Unstaged' })).toBeVisible();
  expect(page.getByRole('button', { name: 'Compare with…' }).query()).toBeNull();
});

test('diff header names base and target', async () => {
  const editor = new EditorManager();
  editor.diffs.add(builtInSources('HEAD (a1b2c3d)'));
  await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

  await expect.poll(() => header()?.textContent).toContain('HEAD (a1b2c3d)');
  expect(header()?.textContent).toContain('Current');
});

test('diff header switches source', async () => {
  const editor = new EditorManager();
  editor.diffs.add(builtInSources());
  const { diff } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);

  await userEvent.click(page.getByRole('button', { name: 'Compared with Unstaged' }));
  await expect.element(page.getByRole('menuitemradio', { name: 'Unstaged' })).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(page.getByRole('menuitemradio', { name: 'Uncommitted' }));

  await expect.poll(() => diff.source).toBe(DEFAULT_DIFF_SOURCES.uncommitted);
  await expect.element(page.getByRole('button', { name: 'Compared with Uncommitted' })).toBeVisible();
});

test('diff header lists sources', async () => {
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

test('diff header skips hidden sources', async () => {
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

test('diff header goes to next and previous change', async () => {
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

test('diff header disables change buttons without changes', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf(DEFAULT_DIFF_SOURCES.unstaged, CODE)]);
  const { file } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
  await expect.element(page.getByRole('button', { name: 'Next change' })).toBeDisabled();
  await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeDisabled();

  file()?.dispatch({ changes: { from: 0, insert: 'omega\n' } });

  await expect.element(page.getByRole('button', { name: 'Next change' })).toBeEnabled();
  await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeEnabled();
});

test('split diff header enables change buttons', async () => {
  const editor = new EditorManager();
  editor.diffs.add([diffSourceOf(DEFAULT_DIFF_SOURCES.unstaged, BASE)]);
  await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'split', editor);

  await expect.element(page.getByRole('button', { name: 'Next change' })).toBeEnabled();
  await expect.element(page.getByRole('button', { name: 'Previous change' })).toBeEnabled();
});

test('diff header switches layout', async () => {
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

test('diff header stops comparing', async () => {
  const editor = new EditorManager();
  editor.diffs.add(builtInSources());
  const { diff } = await mountDiff(DEFAULT_DIFF_SOURCES.unstaged, 'unified', editor);
  await expect.poll(() => header()).not.toBeNull();

  await userEvent.click(page.getByRole('button', { name: 'Close comparison' }));

  await expect.poll(() => diff.source).toBeNull();
  await expect.poll(() => header()).toBeNull();
  await expect.element(page.getByRole('button', { name: 'Compare with…' })).toBeVisible();
});

test('split diff header lines up with sides', async () => {
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
