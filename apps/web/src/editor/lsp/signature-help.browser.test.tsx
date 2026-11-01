import { completionStatus } from '@codemirror/autocomplete';
import { HighlightStyle, LanguageDescription, type LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { LanguageServer } from '@elsewise/plugin';
import { tags as t } from '@lezer/highlight';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { SignatureHelp } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { StubTransport } from '../../../test/stub-transport';

const ROOT = new URL('file:///worktree/');

const HIGHLIGHT = HighlightStyle.define([{ tag: t.typeName, color: '#708090' }]);

const URI = 'file:///worktree/main.rs';

// `fn send(bytes: Bytes, timeout: Duration)`, with its parameters by offset.
const SEND = {
  label: 'fn send(bytes: Bytes, timeout: Duration)',
  parameters: [{ label: [8, 20] as [number, number] }, { label: [22, 39] as [number, number] }],
};

let rust: LanguageSupport;

beforeAll(async () => {
  rust = await (LanguageDescription.matchFilename(languages, 'main.rs') as LanguageDescription).load();
});

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `channel.send` on a server that responds with `help`, types `(`, and returns the rows once shown.
async function open(help: SignatureHelp): Promise<[EditorView, HTMLElement[]]> {
  const server: LanguageServer = {
    id: 'rust',
    name: 'Rust',
    languages: { Rust: 'rust' },
    start: () =>
      new StubTransport(
        { textDocumentSync: 2, signatureHelpProvider: { triggerCharacters: ['(', ','] } },
        { 'textDocument/signatureHelp': () => help },
      ),
  };
  const instance = new LanguageServerInstance(server, ROOT);
  await instance.start();
  await instance.client.initializing;
  const doc = 'channel.send';
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [instance.client.plugin(URI, 'rust'), rust, syntaxHighlighting(HIGHLIGHT)],
    }),
    parent: document.body,
  });
  views.push(view);

  view.focus();
  view.dispatch({
    changes: { from: doc.length, insert: '(' },
    selection: { anchor: doc.length + 1 },
    userEvent: 'input.type',
  });
  const rows = await vi.waitFor(() => {
    const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-lsp-signatures li')];
    expect(rows).not.toHaveLength(0);
    return rows;
  });
  return [view, rows];
}

function press(view: EditorView, key: string): boolean {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key }), 'editor');
}

describe('serverSignatureHelp', () => {
  test('shows every signature', async () => {
    const [, shown] = await open({
      signatures: [{ label: 'fn send(bytes: Bytes)', parameters: [{ label: [8, 20] }] }, SEND],
      activeSignature: 1,
      activeParameter: 0,
    });

    expect(shown.map((row) => row.textContent)).toEqual(['fn send(bytes: Bytes)', SEND.label]);
  });

  test('marks active parameter of each signature, given by offsets or as whole word', async () => {
    const [, shown] = await open({
      signatures: [
        SEND,
        { label: 'fn send(s: String, timeout: u64)', parameters: [{ label: 's' }, { label: 'timeout' }] },
      ],
      activeSignature: 0,
      activeParameter: 1,
    });
    const [send, string] = shown;

    expect(send.querySelector('.cm-lsp-active-parameter')?.textContent).toBe('timeout: Duration');
    expect(string.querySelector('.cm-lsp-active-parameter')?.textContent).toBe('timeout');
  });

  test('prefers active parameter set on signature', async () => {
    const [, [row]] = await open({
      signatures: [{ label: 'fn send(s: String)', parameters: [{ label: 's' }], activeParameter: 0 }],
      activeSignature: 0,
      activeParameter: 3,
    });

    const marked = row.querySelector('.cm-lsp-active-parameter');
    expect(marked?.textContent).toBe('s');
    expect(row.classList).not.toContain('cm-lsp-signature-inapplicable');
  });

  test('dims signature with fewer parameters than arguments', async () => {
    const [, shown] = await open({
      signatures: [
        { label: 'fn send()', parameters: [] },
        { label: 'fn send(bytes: Bytes)', parameters: [{ label: [8, 20] }] },
        SEND,
      ],
      activeSignature: 2,
      activeParameter: 1,
    });

    expect(shown.map((row) => row.classList.contains('cm-lsp-signature-inapplicable'))).toEqual([true, true, false]);
  });

  test('keeps signature without parameters before first argument', async () => {
    const [, [row]] = await open({ signatures: [{ label: 'fn flush()', parameters: [] }], activeParameter: 0 });

    expect(row.classList).not.toContain('cm-lsp-signature-inapplicable');
  });

  test('highlights signature like editor', async () => {
    const [, [row]] = await open({ signatures: [SEND], activeParameter: 0 });

    const type = [...row.querySelectorAll('span')].find((span) => span.textContent === 'Bytes');
    expect(getComputedStyle(type as HTMLElement).color).toBe('rgb(112, 128, 144)');
  });

  test('wraps signature only at space after parameter', async () => {
    const [, [row]] = await open({
      signatures: [
        {
          label: 'fn send_timeout(&self, bytes: Bytes, timeout: Duration) -> Result<()>',
          parameters: [{ label: '&self' }, { label: 'bytes: Bytes' }, { label: 'timeout: Duration' }],
        },
      ],
      activeParameter: 2,
    });

    expect([...row.childNodes].map((node) => [node.nodeName, node.textContent])).toEqual([
      ['SPAN', 'fn send_timeout(&self,'],
      ['#text', ' '],
      ['SPAN', 'bytes: Bytes,'],
      ['#text', ' '],
      ['SPAN', 'timeout: Duration)'],
      ['#text', ' '],
      ['SPAN', '-> Result<()>'],
    ]);
  });

  test('closes on Escape', async () => {
    const [view] = await open({ signatures: [SEND], activeParameter: 0 });
    // Typing `(` leaves completion pending for a moment, and pending completion takes Escape.
    await vi.waitFor(() => expect(completionStatus(view.state)).toBeNull());

    expect(press(view, 'Escape')).toBe(true);
    expect(view.dom.querySelector('.cm-lsp-signatures')).toBeNull();
    expect(press(view, 'Escape')).toBe(false);
  });
});
