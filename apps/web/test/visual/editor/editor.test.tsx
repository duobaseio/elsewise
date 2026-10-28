import { startCompletion } from '@codemirror/autocomplete';
import { foldCode } from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS, type DiffLayout } from '@elsewise/bridge';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { EditorCompletion, LanguageServer } from '@elsewise/plugin';
import { tags } from '@lezer/highlight';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type {
  CodeActionParams,
  CompletionItem,
  CompletionParams,
  DocumentHighlightParams,
  HoverParams,
  ReferenceParams,
  SignatureHelpParams,
} from 'vscode-languageserver-protocol';

import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { DiffState } from '@/editor/diff/diff';
import { Editor } from '@/editor/editor';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { toggleReplaceRow } from '@/editor/search/search-bar-query';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { memoryRouter } from '../../commands';

import { THEMES } from '../../sheet';
import { StubTransport } from '../../stub-transport';

const CODE = `/// Attaches to the session with \`id\`.
pub async fn attach(&self, id: SessionId) -> Result<Channel> {
    let session = self.sessions.get(&id).ok_or(Error::NotFound)?;
    let (tx, rx) = channel::bounded(64);
    session.subscribe(tx).await?;
    Ok(Channel::new(rx))
}
`;

// `CODE` before its last edits: a smaller channel, no subscription and a log line.
const BASE = CODE.replace('bounded(64)', 'bounded(32)')
  .replace('    session.subscribe(tx).await?;\n', '')
  .replace('    Ok(Channel::new(rx))', '    log::debug!("attached");\n    Ok(Channel::new(rx))');

const LINKED = `/// Connects to the relay. See https://example.com/relay for the protocol.
pub fn connect() -> Result<Channel> {
    // Retries back off as https://example.com/retries describes.
    let url = "https://relay.example.com/v1";
    Channel::open(url)
}
`;

const HOVERED = `use crate::session::{attach, Options};

/// Opens the channel for a session.
pub async fn open(id: SessionId) -> Result<()> {
    let channel = attach(id, Options { retries: 3 }).await?;
    channel.send_raw(b"hello")?;
    channel.send(undefined_name)?;
    Ok(())
}
`;

// The hover for each line of `HOVERED`, by line number.
const HOVERS: Record<number, string> = {
  4: [
    '```rust\nelsewise::session\n```',
    '```rust\npub async fn attach(id: SessionId, options: Options) -> Result<Channel>\n```',
    '---',
    'Attaches to the session with `id` and returns its channel.',
    '- Retries up to `options.retries` times.\n- Fails with `Error::NotFound` when no such session exists.',
    'See the [session guide](https://example.com/guide) for the full lifecycle.',
  ].join('\n\n'),
  5: [
    '```rust\nelsewise::session::Channel\n```',
    '```rust\npub fn send_raw(&self, bytes: &[u8]) -> Result<()>\n```',
    '---',
    'Sends `bytes` to the session as they are, without framing or retries.',
    '- Returns `Error::Closed` if the channel was closed.\n- Blocks until the transport accepts the write.',
    'Deprecated since 0.4: use `Channel::send`. See the [session guide](https://example.com/guide).',
  ].join('\n\n'),
};

// Returns the LSP range of the first `text` in `HOVERED`.
function range(text: string) {
  const lines = HOVERED.split('\n');
  const line = lines.findIndex((content) => content.includes(text));
  const character = lines[line].indexOf(text);
  return { start: { line, character }, end: { line, character: character + text.length } };
}

const DIAGNOSTICS = [
  {
    range: range('send_raw'),
    severity: 2,
    tags: [2],
    message: 'use of deprecated method `Channel::send_raw`: use `send` instead',
    source: 'rustc',
    code: 'deprecated',
    codeDescription: { href: 'https://doc.rust-lang.org/rustc/lints/listing/warn-by-default.html#deprecated' },
  },
  {
    range: range('undefined_name'),
    severity: 1,
    message: 'cannot find value `undefined_name` in this scope',
    source: 'rustc',
    code: 'E0425',
    codeDescription: { href: 'https://doc.rust-lang.org/error_codes/E0425.html' },
  },
];

// The completions after `channel.se`, as rust-analyzer gives them.
const MEMBERS = [
  {
    label: 'send',
    kind: 2,
    labelDetails: { detail: '(&self, bytes: Bytes)', description: 'Result<()>' },
    detail: 'pub fn send(&self, bytes: Bytes) -> Result<()>',
  },
  {
    label: 'send_timeout',
    kind: 2,
    labelDetails: { detail: '(&self, bytes: Bytes, timeout: Duration)', description: 'Result<()>' },
  },
  { label: 'session', kind: 5, labelDetails: { description: 'SessionId' } },
  { label: 'set_retries', kind: 2, labelDetails: { detail: '(&mut self, retries: u32)', description: '()' } },
  { label: 'subscribe', kind: 2, labelDetails: { detail: '(&self)', description: 'Receiver<Event>' } },
  { label: 'is_secure', kind: 2, labelDetails: { detail: '(&self)', description: 'bool' } },
  {
    label: 'send_raw',
    kind: 2,
    tags: [1],
    labelDetails: { detail: '(&self, bytes: &[u8])', description: 'Result<()>' },
  },
];

// The completions at the start of a statement, after `ma`.
const STATEMENTS = [
  { label: 'match', kind: 14 },
  { label: 'matches!', kind: 3, labelDetails: { detail: '(…)', description: 'macro' } },
  { label: 'max', kind: 3, labelDetails: { detail: ' (use std::cmp::max)', description: 'fn(T, T) -> T' } },
  { label: 'Mailbox', kind: 22, labelDetails: { detail: ' (use elsewise::mail::Mailbox)', description: 'struct' } },
  { label: 'macro_rules!', kind: 15, labelDetails: { description: 'snippet' } },
  { label: 'format', kind: 6, labelDetails: { description: 'Format' } },
];

// The documentation each completion resolves to, by label.
const RESOLVED: Record<string, string> = {
  send: [
    'Sends `bytes` to the session as one frame, retrying as its `Options` allow.',
    '- Returns `Error::Closed` if the channel was closed.\n- Waits until the transport accepts the write.',
  ].join('\n\n'),
};

// The signatures of `channel.send_timeout(b"ping", `, as rust-analyzer gives them.
const SEND_TIMEOUT = {
  signatures: [
    {
      label: 'fn send_timeout(&self, bytes: Bytes, timeout: Duration) -> Result<()>',
      parameters: [{ label: '&self' }, { label: 'bytes: Bytes' }, { label: 'timeout: Duration' }],
    },
  ],
  activeSignature: 0,
  activeParameter: 2,
};

// The signatures of `attach(id, `: one it has outgrown, the active one, and one that wraps.
const ATTACH = {
  signatures: [
    { label: 'fn attach(id: SessionId) -> Channel', parameters: [{ label: 'id: SessionId' }] },
    {
      label: 'fn attach(id: SessionId, options: Options) -> Result<Channel>',
      parameters: [{ label: 'id: SessionId' }, { label: 'options: Options' }],
    },
    {
      label:
        'fn attach(id: SessionId, options: Options, timeout: Duration, on_close: impl FnOnce(SessionId) -> Result<()>) -> Result<Channel>',
      parameters: [
        { label: 'id: SessionId' },
        { label: 'options: Options' },
        { label: 'timeout: Duration' },
        { label: 'on_close: impl FnOnce(SessionId) -> Result<()>' },
      ],
    },
  ],
  activeSignature: 1,
  activeParameter: 1,
};

// The variable `channel` in `HOVERED`.
const CHANNELS = [range('channel ='), range('channel.send_raw'), range('channel.send(')].map(({ start }) => ({
  start,
  end: { ...start, character: start.character + 'channel'.length },
}));

// A Rust language server that returns hovers from `HOVERS`, diagnostics from `DIAGNOSTICS`, completions after a dot
// from `MEMBERS`, else from `STATEMENTS`, signatures in a method call from `SEND_TIMEOUT`, else from `ATTACH`, and
// renames, usages and highlights of `channel` from `CHANNELS`, with one more usage in a file that isn't open, and code
// actions, with fixes for `undefined_name`.
const RUST: LanguageServer = {
  id: 'rust',
  name: 'Rust',
  languages: { Rust: 'rust' },
  start: () => {
    const stub = new StubTransport(
      {
        textDocumentSync: 2,
        hoverProvider: true,
        diagnosticProvider: {},
        completionProvider: { triggerCharacters: ['.'], resolveProvider: true },
        signatureHelpProvider: { triggerCharacters: ['(', ','] },
        renameProvider: { prepareProvider: true },
        referencesProvider: true,
        documentHighlightProvider: true,
        codeActionProvider: true,
        definitionProvider: true,
        documentFormattingProvider: true,
      },
      {
        'textDocument/hover': ({ position }: HoverParams) => {
          const value = HOVERS[position.line];
          return value === undefined ? null : { contents: { kind: 'markdown', value } };
        },
        'textDocument/diagnostic': () => ({ kind: 'full', items: DIAGNOSTICS }),
        'textDocument/completion': ({ position }: CompletionParams) => (position.character > 8 ? MEMBERS : STATEMENTS),
        'completionItem/resolve': (item: CompletionItem) => {
          const value = RESOLVED[item.label];
          return value === undefined ? item : { ...item, documentation: { kind: 'markdown', value } };
        },
        'textDocument/signatureHelp': ({ position }: SignatureHelpParams) =>
          position.character > 20 ? SEND_TIMEOUT : ATTACH,
        'textDocument/prepareRename': () => CHANNELS[0],
        'textDocument/references': ({ textDocument }: ReferenceParams) => [
          ...CHANNELS.map((range) => ({ uri: textDocument.uri, range })),
          {
            uri: 'file:///worktree/src/session.rs',
            range: { start: { line: 41, character: 8 }, end: { line: 41, character: 15 } },
          },
        ],
        // The ranges are the sample's, so it stops returning them once the sample is edited.
        'textDocument/documentHighlight': ({ position }: DocumentHighlightParams) =>
          !stub.methods.includes('textDocument/didChange') &&
          CHANNELS.some(
            ({ start, end }) =>
              start.line === position.line &&
              start.character <= position.character &&
              position.character <= end.character,
          )
            ? CHANNELS.map((range, i) => ({ range, kind: i === 0 ? 3 : 2 }))
            : [],
        'textDocument/codeAction': ({ context }: CodeActionParams) => [
          ...(context.diagnostics.some((diagnostic) => diagnostic.code === 'E0425')
            ? [
                { title: 'Import `undefined_name` from `crate::names`', kind: 'quickfix', isPreferred: true },
                { title: 'Create a local `undefined_name`', kind: 'quickfix' },
              ]
            : []),
          { title: 'Inline `channel`', kind: 'refactor.inline' },
          { title: 'Organize imports', kind: 'source.organizeImports' },
        ],
      },
    );
    return stub;
  },
};

// Returns the `data:` URL of an SVG of `path` in a 16 by 16 box.
const svg = (path: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${path}"/></svg>`,
  )}`;

// Completions with a plugin's icons: tagged and plain letters and SVGs, and a colored image, beside a type's
// letterform.
const ICONS: EditorCompletion[] = [
  { label: 'session', type: 'variable', detail: 'Session' },
  { label: 'send', icon: { letters: 'Fn', tag: tags.function(tags.variableName) }, tail: '(bytes: &[u8])' },
  { label: 'select', icon: { letters: 'R' }, detail: 'macro' },
  { label: 'sender', icon: { svg: svg('M9 1 3 9h4l-1 6 6-8H8l1-6Z'), tag: tags.keyword }, detail: 'Sender<Bytes>' },
  { label: 'secret', icon: { svg: svg('M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0Z') } },
  {
    label: 'serde',
    icon: {
      image: `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#e5533d"/>' +
          '<circle cx="8" cy="8" r="3.5" fill="#f6c343"/></svg>',
      )}`,
    },
    detail: 'crate',
  },
];

// Mounts the editor, on `HOVERED` with a Rust language server if `hovered`, else on `code`, with a plugin's
// `extensions`, and diffed against `BASE` in `diff` if given.
async function mount(
  theme: 'light' | 'dark',
  hovered = false,
  code = CODE,
  extensions: readonly Extension[] = [],
  diff?: DiffLayout,
): Promise<EditorView> {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
    },
  });
  const editor = new EditorManager();
  if (hovered) {
    editor.languages.addServers([RUST]);
  }
  editor.addExtensions(extensions);
  editor.diffs.add([
    { id: 'test.base', label: 'Base', base: async () => ({ code: BASE }) },
    { id: 'test.branch', label: 'Branch main', base: async () => ({ code: BASE }) },
  ]);
  const commands = new CommandManager({
    appearance: new AppearanceManager(theme, resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, theme)),
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
  });
  render(
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={new LanguageServers(editor)}>
            <div
              className="bg-background font-sans text-foreground"
              data-brightness={theme}
              data-testid="sheet"
              style={{ width: 1040, height: hovered ? 420 : 300 }}
            >
              {hovered ? (
                <Editor
                  content={{ label: 'Current', code: HOVERED }}
                  relativePath="src/main.rs"
                  root={new URL('file:///worktree/')}
                  diff={new DiffState(null, 'unified')}
                />
              ) : (
                <Editor
                  content={{ label: 'Current', code }}
                  relativePath="transport.rs"
                  diff={new DiffState(diff === undefined ? null : 'test.base', diff ?? 'unified')}
                />
              )}
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>,
  );

  // The language loads after the first paint.
  await vi.waitFor(() => {
    if (document.querySelector('.cm-line span') === null) {
      throw new Error('not highlighted');
    }
  });
  if (hovered) {
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
  }
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('no editor');
  }
  return view;
}

// Points at the first `text` in `view` with the keys in `init` held, and waits for the hover to open with `sections`.
async function hover(view: EditorView, text: string, sections: number, init: MouseEventInit = {}): Promise<void> {
  const { left, top, bottom } = view.coordsAtPos(view.state.doc.toString().indexOf(text) + 1) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { ...init, clientX: x, clientY: y, bubbles: true }));
  await vi.waitFor(
    () => expect(document.querySelectorAll('.cm-tooltip-hover .cm-tooltip-section')).toHaveLength(sections),
    { timeout: 2000 },
  );
}

// Types `line` below the one that attaches, and waits for its completions to open with documentation if `documented`.
async function complete(view: EditorView, line: string, documented: boolean): Promise<void> {
  const end = view.state.doc.lineAt(view.state.doc.toString().indexOf('let channel')).to;
  view.dispatch({ changes: { from: end, insert: `\n${line}` }, selection: { anchor: end + 1 + line.length } });
  view.focus();
  startCompletion(view);
  await vi.waitFor(
    () => {
      expect(document.querySelector('.cm-tooltip-autocomplete li[aria-selected]')).not.toBeNull();
      expect(document.querySelector('.cm-completionInfo .cm-lsp-content') !== null).toBe(documented);
    },
    { timeout: 2000 },
  );
}

// Types `line` below the one that attaches, and waits for its signatures to open with `rows`.
async function sign(view: EditorView, line: string, rows: number): Promise<void> {
  const end = view.state.doc.lineAt(view.state.doc.toString().indexOf('let channel')).to;
  view.focus();
  view.dispatch({
    changes: { from: end, insert: `\n${line}` },
    selection: { anchor: end + 1 + line.length },
    userEvent: 'input.type',
  });
  await vi.waitFor(() => expect(document.querySelectorAll('.cm-lsp-signatures li')).toHaveLength(rows), {
    timeout: 2000,
  });
}

test.each(THEMES)('editor (%s)', async (theme) => {
  await mount(theme);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-${theme}`);
});

test.each(THEMES)('editor search and replace (%s)', async (theme) => {
  const view = await mount(theme);
  openSearchPanel(view);
  view.dispatch({
    effects: [setSearchQuery.of(new SearchQuery({ search: 'session', replace: 'channel' })), toggleReplaceRow.of(true)],
  });
  findNext(view);
  await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-search-${theme}`);
});

test.each(THEMES)('editor unified diff (%s)', async (theme) => {
  await mount(theme, false, CODE, [], 'unified');
  await expect.poll(() => document.querySelector('.cm-changedLine')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-unified-${theme}`);
});

test.each(THEMES)('editor split diff (%s)', async (theme) => {
  await mount(theme, false, CODE, [], 'split');
  await expect.poll(() => document.querySelector('.cm-mergeView .cm-changedLine')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-split-${theme}`);
});

// Selects from the middle of the line before the deleted ones to the middle of the added line, so the selection crosses
// deleted, changed and added lines, and the active line shows on the added line's unselected part.
const select = (view: EditorView) =>
  view.dispatch({ selection: { anchor: CODE.indexOf('self.sessions'), head: CODE.indexOf('.await') } });

test.each(THEMES)('editor unified diff with selection (%s)', async (theme) => {
  const view = await mount(theme, false, CODE, [], 'unified');
  await expect.poll(() => document.querySelector('.cm-deletedChunk')).not.toBeNull();
  select(view);
  await expect.poll(() => document.querySelector('.cm-selectionBackground')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-unified-selection-${theme}`);
});

test.each(THEMES)('editor split diff with selection (%s)', async (theme) => {
  await mount(theme, false, CODE, [], 'split');
  await expect.poll(() => document.querySelector('.cm-mergeView .cm-changedLine')).not.toBeNull();
  select(EditorView.findFromDOM(document.querySelector('.cm-merge-b') as HTMLElement) as EditorView);
  await expect.poll(() => document.querySelector('.cm-merge-b .cm-selectionBackground')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-split-selection-${theme}`);
});

test.each(THEMES)('editor unified diff with cursor below deleted lines (%s)', async (theme) => {
  const view = await mount(theme, false, CODE, [], 'unified');
  await expect.poll(() => document.querySelector('.cm-deletedChunk')).not.toBeNull();
  view.dispatch({ selection: { anchor: CODE.indexOf('let (tx') } });
  await expect.poll(() => document.querySelector('.cm-activeLine')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-unified-active-line-${theme}`);
});

test.each(THEMES)('editor compare menu (%s)', async (theme) => {
  // The menu is portalled to the body, outside the editor's brightness, so the page takes it as the app does.
  document.documentElement.dataset.brightness = theme;
  onTestFinished(() => {
    delete document.documentElement.dataset.brightness;
  });
  await mount(theme);
  await userEvent.click(page.getByRole('button', { name: 'Compare with…' }));
  await expect.element(page.getByRole('menuitemradio', { name: 'Branch main' })).toBeVisible();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-compare-menu-${theme}`);
});

test.each(THEMES)('editor diff source menu (%s)', async (theme) => {
  document.documentElement.dataset.brightness = theme;
  // The click leaves the pointer on the button, which later tests would show hovered, so it moves right of the editor.
  onTestFinished(async () => {
    delete document.documentElement.dataset.brightness;
    await userEvent.hover(page.elementLocator(document.documentElement), { position: { x: 1300, y: 20 } });
  });
  await mount(theme, false, CODE, [], 'unified');
  await expect.poll(() => document.querySelector('.cm-changedLine')).not.toBeNull();
  await userEvent.click(page.getByRole('button', { name: 'Compared with Base' }));
  await expect.element(page.getByRole('menuitemradio', { name: 'Base' })).toHaveAttribute('aria-checked', 'true');

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diff-source-menu-${theme}`);
});

test.each(THEMES)('editor folded (%s)', async (theme) => {
  const view = await mount(theme);
  view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
  foldCode(view);
  await expect.poll(() => document.querySelector('.cm-foldPlaceholder')).not.toBeNull();

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-folded-${theme}`);
});

test.each(THEMES)('editor diagnostics (%s)', async (theme) => {
  const view = await mount(theme);
  // Returns the range of the first `text` in `CODE`.
  const at = (text: string) => ({ from: CODE.indexOf(text), to: CODE.indexOf(text) + text.length });
  view.dispatch(
    setDiagnostics(view.state, [
      { ...at('SessionId'), severity: 'error', message: 'error' },
      { ...at('ok_or'), severity: 'warning', markClass: 'cm-lintRange-deprecated', message: 'deprecated' },
      { ...at('let (tx, rx)'), severity: 'warning', markClass: 'cm-lintRange-unnecessary', message: 'unnecessary' },
      { ...at('subscribe'), severity: 'warning', message: 'warning' },
      { ...at('Channel::new'), severity: 'hint', message: 'hint' },
      // A diagnostic with nothing to underline.
      { from: at('Ok(Channel::new(rx))').to, to: at('Ok(Channel::new(rx))').to, severity: 'info', message: 'point' },
    ]),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-diagnostics-${theme}`);
});

test.each(THEMES)('editor hover over symbol (%s)', async (theme) => {
  const view = await mount(theme, true);
  await hover(view, 'attach(id', 1);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-hover-${theme}`);
});

test.each(THEMES)('editor hover over diagnostic (%s)', async (theme) => {
  const view = await mount(theme, true);
  await hover(view, 'undefined_name', 1);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-hover-diagnostic-${theme}`);
});

test.each(THEMES)('editor hover over diagnostic with documentation (%s)', async (theme) => {
  const view = await mount(theme, true);
  await hover(view, 'send_raw', 2);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-hover-diagnostic-documentation-${theme}`);
});

test.each(THEMES)('editor links at rest (%s)', async (theme) => {
  await mount(theme, false, LINKED);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-links-${theme}`);
});

test.each(THEMES)('editor links hovered (%s)', async (theme) => {
  const view = await mount(theme, false, LINKED);
  await hover(view, 'https://example.com/retries', 1);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-links-hover-${theme}`);
});

test.each(THEMES)('editor links hovered with key held (%s)', async (theme) => {
  const view = await mount(theme, false, LINKED);
  await hover(view, 'https://example.com/retries', 1, PLATFORM === 'mac' ? { metaKey: true } : { ctrlKey: true });
  await vi.waitFor(() => expect(document.querySelector('.cm-link-active')).not.toBeNull());

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-links-active-${theme}`);
});

test.each(THEMES)('editor completion with documentation (%s)', async (theme) => {
  const view = await mount(theme, true);
  await complete(view, '    channel.se', true);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-completion-documentation-${theme}`);
});

test.each(THEMES)('editor completion of statement (%s)', async (theme) => {
  const view = await mount(theme, true);
  await complete(view, '    ma', false);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-completion-statement-${theme}`);
});

test.each(THEMES)('editor completion with icons (%s)', async (theme) => {
  const view = await mount(theme, false, CODE, [EditorState.languageData.of(() => [{ autocomplete: ICONS }])]);
  const end = view.state.doc.lineAt(CODE.indexOf('let (tx, rx)')).to;
  view.dispatch({ changes: { from: end, insert: '\n    se' }, selection: { anchor: end + 7 } });
  view.focus();
  startCompletion(view);
  await vi.waitFor(() => expect(document.querySelectorAll('.cm-tooltip-autocomplete li')).toHaveLength(6));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-completion-icons-${theme}`);
});

test.each(THEMES)('editor signature help of one signature (%s)', async (theme) => {
  const view = await mount(theme, true);
  await sign(view, '    channel.send_timeout(b"ping", ', 1);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-signature-help-${theme}`);
});

test.each(THEMES)('editor signature help of overloads (%s)', async (theme) => {
  const view = await mount(theme, true);
  await sign(view, '    attach(id, ', 3);

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-signature-help-overloads-${theme}`);
});

test.each(THEMES)('editor rename (%s)', async (theme) => {
  const view = await mount(theme, true);
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('channel =') + 2 } });
  await userEvent.keyboard('{Shift>}{F6}{/Shift}');
  const input = await vi.waitFor(() => {
    const input = document.querySelector<HTMLInputElement>('.cm-lsp-rename-field input');
    expect(document.activeElement).toBe(input);
    return input as HTMLInputElement;
  });
  await userEvent.keyboard('stream');
  // Hides the caret, which blinks.
  input.style.caretColor = 'transparent';

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-rename-${theme}`);
});

test.each(THEMES)('editor references (%s)', async (theme) => {
  const view = await mount(theme, true);
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('channel.send_raw') + 2 } });
  await vi.waitFor(() => expect(document.querySelectorAll('.cm-lsp-highlight')).toHaveLength(3));
  await userEvent.keyboard(
    PLATFORM === 'mac' ? '{Meta>}{Alt>}{F7}{/Alt}{/Meta}' : '{Control>}{Alt>}{F7}{/Alt}{/Control}',
  );
  await vi.waitFor(() => expect(document.querySelector('.cm-lsp-references')).not.toBeNull());

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-references-${theme}`);
});

test.each(THEMES)('editor symbol highlights (%s)', async (theme) => {
  const view = await mount(theme, true);
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('channel.send_raw') + 2 } });
  await vi.waitFor(() => expect(document.querySelectorAll('.cm-lsp-highlight')).toHaveLength(3));

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-highlights-${theme}`);
});

test.each(THEMES)('editor context actions (%s)', async (theme) => {
  const view = await mount(theme, true);
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('undefined_name') + 2 } });
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
  await vi.waitFor(() => expect(document.querySelector('.cm-actions')).not.toBeNull());

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`editor-context-actions-${theme}`);
});
