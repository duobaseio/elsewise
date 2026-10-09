import { startCompletion } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { OS } from '@elsewise/components/lib/os';
import type { LanguageServer } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type {
  CompletionItem,
  CompletionParams,
  HoverParams,
  ReferenceParams,
  SignatureHelpParams,
} from 'vscode-languageserver-protocol';

import { CodeEditor } from '@/components/code-editor/code-editor';
import { toggleReplaceRow } from '@/components/code-editor/search/search-bar-query';
import { LanguageServers, LanguageServersContext } from '@/language-servers/language-servers';
import { EditorAdditions, EditorAdditionsContext } from '@/plugins/editor';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../sheet';
import { stubTransport } from '../../stub-transport';

const CODE = `/// Attaches to the session with \`id\`.
pub async fn attach(&self, id: SessionId) -> Result<Channel> {
    let session = self.sessions.get(&id).ok_or(Error::NotFound)?;
    let (tx, rx) = channel::bounded(64);
    session.subscribe(tx).await?;
    Ok(Channel::new(rx))
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

// A Rust language server that answers hovers from `HOVERS`, diagnostics from `DIAGNOSTICS`, completions after a dot
// from `MEMBERS`, else from `STATEMENTS`, signatures in a method call from `SEND_TIMEOUT`, else from `ATTACH`, and
// renames and usages of `channel` from `CHANNELS`, with one more usage in a file that isn't open.
const RUST: LanguageServer = {
  id: 'rust',
  name: 'Rust',
  languages: { Rust: 'rust' },
  start: () =>
    stubTransport(
      {
        textDocumentSync: 2,
        hoverProvider: true,
        diagnosticProvider: {},
        completionProvider: { triggerCharacters: ['.'], resolveProvider: true },
        signatureHelpProvider: { triggerCharacters: ['(', ','] },
        renameProvider: { prepareProvider: true },
        documentHighlightProvider: true,
        referencesProvider: true,
      },
      {
        'textDocument/hover': ({ position }: HoverParams) => {
          const value = HOVERS[position.line];
          return value === undefined ? null : { contents: { kind: 'markdown', value } };
        },
        'textDocument/diagnostic': () => ({ kind: 'full', items: DIAGNOSTICS }),
        'textDocument/completion': ({ position }: CompletionParams) => (position.character > 8 ? MEMBERS : STATEMENTS),
        'textDocument/signatureHelp': ({ position }: SignatureHelpParams) =>
          position.character > 20 ? SEND_TIMEOUT : ATTACH,
        'textDocument/prepareRename': () => CHANNELS[0],
        'textDocument/documentHighlight': () => CHANNELS.map((range) => ({ range })),
        'textDocument/references': ({ textDocument }: ReferenceParams) => [
          ...CHANNELS.map((range) => ({ uri: textDocument.uri, range })),
          {
            uri: 'file:///worktree/src/session.rs',
            range: { start: { line: 41, character: 8 }, end: { line: 41, character: 15 } },
          },
        ],
        'completionItem/resolve': (item: CompletionItem) => {
          const value = RESOLVED[item.label];
          return value === undefined ? item : { ...item, documentation: { kind: 'markdown', value } };
        },
      },
    ),
};

// Mounts the editor, on `HOVERED` with a Rust language server if `hovered`.
async function mount(theme: 'light' | 'dark', hovered = false): Promise<EditorView> {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, {
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      general: { ...DEFAULT_SETTINGS.appearance.general, brightness: theme },
    },
  });
  const additions = new EditorAdditions();
  if (hovered) {
    additions.addLanguageServers([RUST]);
  }
  render(
    <QueryClientProvider client={client}>
      <EditorAdditionsContext value={additions}>
        <LanguageServersContext value={new LanguageServers(additions)}>
          <div
            className="bg-background font-sans text-foreground"
            data-brightness={theme}
            data-testid="editor"
            style={{ width: 1040, height: hovered ? 420 : 300 }}
          >
            {hovered ? (
              <CodeEditor code={HOVERED} path="src/main.rs" root={new URL('file:///worktree/')} />
            ) : (
              <CodeEditor code={CODE} path="transport.rs" />
            )}
          </div>
        </LanguageServersContext>
      </EditorAdditionsContext>
    </QueryClientProvider>,
  );

  // The language loads after the first paint.
  await vi.waitFor(() => {
    if (document.querySelector('.cm-line span') === null) {
      throw new Error('not highlighted');
    }
  });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (view === null) {
    throw new Error('no editor');
  }
  return view;
}

// Points at the first `text` in `view`, and waits for the hover to open with `sections`.
async function hover(view: EditorView, text: string, sections: number): Promise<void> {
  const { left, top, bottom } = view.coordsAtPos(view.state.doc.toString().indexOf(text) + 1) as DOMRect;
  const [x, y] = [left + 1, (top + bottom) / 2];
  document
    .elementFromPoint(x, y)
    ?.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
  await vi.waitFor(
    () => expect(document.querySelectorAll('.cm-tooltip-hover .cm-tooltip-section')).toHaveLength(sections),
    {
      timeout: 2000,
    },
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

describe.each(THEMES)('code editor (%s)', (theme) => {
  test('plain', async () => {
    await mount(theme);

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-${theme}`);
  });

  test('search and replace', async () => {
    const view = await mount(theme);
    openSearchPanel(view);
    view.dispatch({
      effects: [
        setSearchQuery.of(new SearchQuery({ search: 'session', replace: 'channel' })),
        toggleReplaceRow.of(true),
      ],
    });
    findNext(view);
    await expect.element(page.getByRole('textbox', { name: 'Replace' })).toBeVisible();

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-search-${theme}`);
  });

  test('diagnostics', async () => {
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
      ]),
    );

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-diagnostics-${theme}`);
  });

  describe('hover', () => {
    test('over a symbol', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await hover(view, 'attach(id', 1);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-${theme}`);
    });

    test('over a problem', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await hover(view, 'undefined_name', 1);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-problem-${theme}`);
    });

    test('over a problem with documentation', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await hover(view, 'send_raw', 2);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-problem-documentation-${theme}`);
    });
  });

  describe('completion', () => {
    test('with documentation', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await complete(view, '    channel.se', true);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-completion-documentation-${theme}`);
    });

    test('of a statement', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await complete(view, '    ma', false);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-completion-statement-${theme}`);
    });
  });

  describe('signature help', () => {
    test('of one signature', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await sign(view, '    channel.send_timeout(b"ping", ', 1);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-signature-help-${theme}`);
    });

    test('of overloads', async () => {
      const view = await mount(theme, true);
      await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
      await sign(view, '    attach(id, ', 3);

      await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-signature-help-overloads-${theme}`);
    });
  });

  test('rename', async () => {
    const view = await mount(theme, true);
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
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

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-rename-${theme}`);
  });

  test('references', async () => {
    const view = await mount(theme, true);
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('channel.send_raw') + 2 } });
    await userEvent.keyboard(OS === 'mac' ? '{Meta>}{Alt>}{F7}{/Alt}{/Meta}' : '{Control>}{Alt>}{F7}{/Alt}{/Control}');
    await vi.waitFor(() => expect(document.querySelector('.cm-lsp-references')).not.toBeNull());

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-references-${theme}`);
  });
});
