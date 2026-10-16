import { startCompletion } from '@codemirror/autocomplete';
import { indentUnit, LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, type LanguageServer } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
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
  return {
    ...actual,
    useActiveTheme: () => {
      const elsewise = actual.resolveActiveTheme(actual.THEMES, { source: 'elsewise', name: 'elsewise' }, 'light');
      return { ...elsewise, editor: { ...elsewise.editor, ...EDITOR } };
    },
  };
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
              <Editor code={code} path={path} root={root} />
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
  editor.addExtensions([(document) => EditorView.contentAttributes.of({ 'data-path': document.path })]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  expect(view.contentDOM.dataset.path).toBe('main.rs');
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

// A plugin's hover source of a section reading `text` over the whole document.
function blame(text: string) {
  return {
    source: (view: EditorView) => ({
      pos: 0,
      end: view.state.doc.length,
      create: () => ({ dom: Object.assign(document.createElement('div'), { className: 'blame', textContent: text }) }),
    }),
  };
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
  editor.addHoverTooltipSources([blame('You, yesterday')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);

  point(view, 4);

  await expect
    .poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent, { timeout: 2000 })
    .toBe('You, yesterday');
});

test("plugin's hover section goes once disposed", async () => {
  const editor = new EditorManager();
  const dispose = editor.addHoverTooltipSources([blame('You, yesterday')]);
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
  editor.addHoverTooltipSources([blame('You, yesterday')]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
  view.dispatch({ selection: { anchor: 4 } });

  view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);

  await expect.poll(() => view.dom.querySelector('.cm-tooltip-hover .blame')?.textContent).toBe('You, yesterday');
});

test("plugin's language highlights files with extension", async () => {
  const editor = new EditorManager();
  editor.addLanguages([commentLanguage(['comment'])]);
  const view = await mountEditor('hello\n', 'main.comment', editor);

  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));
});

test("plugin's language beats built-in until disposed", async () => {
  const editor = new EditorManager();
  const dispose = editor.addLanguages([commentLanguage(['rs'])]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', editor);
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));

  dispose();
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.keyword.color));
});

test("plugin's language server opens files in language", async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  editor.addLanguageServers([server]);
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
  editor.addLanguageServers([server]);

  await expect
    .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
    .toMatchObject({ params: { textDocument: { uri: 'file:///worktree/src/main.rs' } } });
});

test("plugin's language server keeps file open when another language's server is added", async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  editor.addLanguageServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', editor, new URL('file:///worktree/'));
  await expect.poll(() => sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);

  editor.addLanguageServers([{ ...rustServer().server, id: 'toy', languages: { Toy: 'toy' } }]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);
});

test('file without root has no language server', async () => {
  const editor = new EditorManager();
  const { server, sent } = rustServer();
  editor.addLanguageServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', editor);
  await new Promise((resolve) => setTimeout(resolve));

  expect(sent).toEqual([]);
});
