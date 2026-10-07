import { setDiagnostics } from '@codemirror/lint';
import { findNext, openSearchPanel, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import type { LanguageServer } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { CodeEditor } from '@/components/code-editor/code-editor';
import { toggleReplaceRow } from '@/components/code-editor/search/search-bar-query';
import { LanguageServers, LanguageServersContext } from '@/language-servers/language-servers';
import { EditorAdditions, EditorAdditionsContext } from '@/plugins/editor';
import { settingsQuery } from '@/settings/settings';

import { THEMES } from '../../sheet';

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

// A Rust language server that answers hovers from `HOVERS` and diagnostics from `DIAGNOSTICS`.
const RUST: LanguageServer = {
  id: 'rust',
  name: 'Rust',
  languages: { Rust: 'rust' },
  start: () => {
    const listeners = new Set<(message: string) => void>();
    const reply = (id: number, result: unknown) => {
      for (const listener of listeners) {
        listener(JSON.stringify({ jsonrpc: '2.0', id, result }));
      }
    };
    return {
      send(message) {
        const { id, method, params } = JSON.parse(message);
        if (method === 'initialize') {
          reply(id, { capabilities: { textDocumentSync: 2, hoverProvider: true, diagnosticProvider: {} } });
        } else if (method === 'textDocument/hover') {
          const value = HOVERS[params.position.line];
          reply(id, value === undefined ? null : { contents: { kind: 'markdown', value } });
        } else if (method === 'textDocument/diagnostic') {
          reply(id, { kind: 'full', items: DIAGNOSTICS });
        }
      },
      onMessage(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onClose: () => () => {},
      close() {},
    };
  },
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

  test('hover', async () => {
    const view = await mount(theme, true);
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
    await hover(view, 'attach(id', 1);

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-${theme}`);
  });

  test('hover over a problem', async () => {
    const view = await mount(theme, true);
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
    await hover(view, 'undefined_name', 1);

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-problem-${theme}`);
  });

  test('hover over a problem with documentation', async () => {
    const view = await mount(theme, true);
    await vi.waitFor(() => expect(document.querySelector('.cm-lintRange-error')).not.toBeNull());
    await hover(view, 'send_raw', 2);

    await expect(page.getByTestId('editor')).toMatchScreenshot(`code-editor-hover-problem-documentation-${theme}`);
  });
});
