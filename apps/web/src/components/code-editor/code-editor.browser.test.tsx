import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type Settings } from '@elsewise/bridge';
import type { LanguageServer } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CodeEditor } from '@/components/code-editor/code-editor';
import { LanguageServers, LanguageServersContext } from '@/language-servers/language-servers';
import { EditorAdditions, EditorAdditionsContext } from '@/plugins/editor';
import { settingsQuery } from '@/settings/settings';

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
vi.mock('@/themes/themes', async (original) => {
  const actual = await original<typeof import('@/themes/themes')>();
  return {
    ...actual,
    useTheme: () => {
      const elsewise = actual.resolveTheme(actual.THEMES, { source: 'elsewise', name: 'elsewise' }, 'light');
      return { ...elsewise, editor: { ...elsewise.editor, ...EDITOR } };
    },
  };
});

const SETTINGS: Settings = {
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
  additions = new EditorAdditions(),
  root?: URL,
): Promise<EditorView> {
  const screen = await render(
    shell(
      <EditorAdditionsContext value={additions}>
        <LanguageServersContext value={new LanguageServers(additions)}>
          <div style={{ height: 300 }}>
            <CodeEditor code={code} path={path} root={root} />
          </div>
        </LanguageServersContext>
      </EditorAdditionsContext>,
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
function rustServer(): { server: LanguageServer; sent: { method?: string; params?: unknown }[] } {
  const sent: { method?: string; params?: unknown }[] = [];
  const listeners = new Set<(message: string) => void>();
  return {
    sent,
    server: {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () => ({
        send(message) {
          const parsed = JSON.parse(message);
          sent.push(parsed);
          if (parsed.method === 'initialize') {
            for (const listener of listeners) {
              listener(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { capabilities: {} } }));
            }
          }
        },
        onMessage(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        onClose: () => () => {},
        close() {},
      }),
    },
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

test('tooltips above the search bar', async () => {
  const view = await mountEditor('fn main() {}\n');
  openSearchPanel(view);
  await userEvent.hover(page.getByRole('button', { name: 'Next match' }));

  const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');
  await expect.poll(tooltip).not.toBeNull();
  const { left, top, width, height } = (tooltip() as Element).getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  expect(tooltip()?.contains(hit)).toBe(true);
});

test('the fold marker is drawn from the icon set', async () => {
  const view = await mountEditor('fn main() {\n    let a = 1;\n}\n');
  await expect.poll(() => view.dom.querySelector('.cm-fold-marker')).not.toBeNull();
  expect(style(view.dom.querySelector('.cm-fold-marker')).maskImage).toMatch(/^url\("data:image\/svg\+xml,/);
});

test("a plugin's theme overrides the editor's metrics", async () => {
  const additions = new EditorAdditions();
  additions.addExtensions([EditorView.theme({ '.cm-content': { paddingBottom: '0px' } })]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', additions);

  expect(style(view.contentDOM).paddingBottom).toBe('0px');
});

test("a plugin's extension function receives the file", async () => {
  const additions = new EditorAdditions();
  additions.addExtensions([(document) => EditorView.contentAttributes.of({ 'data-path': document.path })]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', additions);

  expect(view.contentDOM.dataset.path).toBe('main.rs');
});

test("a plugin's language highlights files with its extension", async () => {
  const additions = new EditorAdditions();
  additions.addLanguages([commentLanguage(['comment'])]);
  const view = await mountEditor('hello\n', 'main.comment', additions);

  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));
});

test("a plugin's language wins over a built-in one until disposed", async () => {
  const additions = new EditorAdditions();
  const dispose = additions.addLanguages([commentLanguage(['rs'])]);
  const view = await mountEditor('fn main() {}\n', 'main.rs', additions);
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.comment.color));

  dispose();
  await expect.poll(() => firstTokenColor(view)).toBe(rgb(EDITOR.tokens.keyword.color));
});

test("a plugin's language server opens files in its language", async () => {
  const additions = new EditorAdditions();
  const { server, sent } = rustServer();
  additions.addLanguageServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', additions, new URL('file:///worktree/'));

  await expect
    .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
    .toMatchObject({
      params: { textDocument: { uri: 'file:///worktree/src/main.rs', languageId: 'rust', text: 'fn main() {}\n' } },
    });
  expect(sent[0]).toMatchObject({ method: 'initialize', params: { rootUri: 'file:///worktree/' } });
});

test("a plugin's language server opens files that were open before it was added", async () => {
  const additions = new EditorAdditions();
  const { server, sent } = rustServer();
  await mountEditor('fn main() {}\n', 'src/main.rs', additions, new URL('file:///worktree/'));
  additions.addLanguageServers([server]);

  await expect
    .poll(() => sent.find((message) => message.method === 'textDocument/didOpen'))
    .toMatchObject({ params: { textDocument: { uri: 'file:///worktree/src/main.rs' } } });
});

test("a plugin's language server keeps a file open when a server for another language is added", async () => {
  const additions = new EditorAdditions();
  const { server, sent } = rustServer();
  additions.addLanguageServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', additions, new URL('file:///worktree/'));
  await expect.poll(() => sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);

  additions.addLanguageServers([{ ...rustServer().server, id: 'toy', languages: { Toy: 'toy' } }]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(sent.filter((message) => message.method === 'textDocument/didOpen')).toHaveLength(1);
});

test('a file without a root has no language server', async () => {
  const additions = new EditorAdditions();
  const { server, sent } = rustServer();
  additions.addLanguageServers([server]);
  await mountEditor('fn main() {}\n', 'src/main.rs', additions);
  await new Promise((resolve) => setTimeout(resolve));

  expect(sent).toEqual([]);
});
