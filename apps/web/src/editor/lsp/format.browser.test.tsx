import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DocumentRangeFormattingParams } from 'vscode-languageserver-protocol';
import { format } from '@/editor/format';
import { LanguageServerInstance } from '@/editor/lsp/language-servers';
import { commandsExtension } from '../../../test/commands';
import { StubTransport } from '../../../test/stub-transport';

const URI = 'file:///worktree/main.rs';

const DOC = 'let  total=1;';

// Lines that each format to `let x = n;`.
const LINES = 'let  a=1;\nlet  b=2;\nlet  c=3;';

// Returns the edits that format each of `LINES` that `range` touches.
function formatLines({ range }: DocumentRangeFormattingParams) {
  return Array.from({ length: range.end.line - range.start.line + 1 }, (_, i) => range.start.line + i).flatMap(
    (line) => [
      { range: { start: { line, character: 3 }, end: { line, character: 5 } }, newText: ' ' },
      { range: { start: { line, character: 6 }, end: { line, character: 7 } }, newText: ' = ' },
    ],
  );
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

// Opens `doc` on a server with `capabilities` that formats it with `format`, and its ranges with `formatRange`.
async function open(
  capabilities: object,
  formatDocument: () => unknown,
  formatRange: (params: DocumentRangeFormattingParams) => unknown = () => [],
  doc = DOC,
): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () =>
        new StubTransport(capabilities, {
          'textDocument/formatting': formatDocument,
          'textDocument/rangeFormatting': formatRange,
        }),
    } satisfies LanguageServer,
    new URL('file:///worktree/'),
  );
  await instance.start();
  await instance.client.initializing;
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        instance.client.plugin(URI, 'rust'),
        format,
        commandsExtension(),
        EditorState.allowMultipleSelections.of(true),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Presses Mod-Alt-L.
function press(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'l',
    altKey: true,
    metaKey: PLATFORM === 'mac',
    ctrlKey: PLATFORM !== 'mac',
  });
  return runScopeHandlers(view, event, 'editor');
}

const CAPABILITIES = { documentFormattingProvider: true, documentRangeFormattingProvider: true };

describe('serverFormat', () => {
  test('applies server edits', async () => {
    const formatDocument = vi.fn(() => [
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }, newText: ' ' },
      { range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, newText: ' = ' },
    ]);
    const view = await open({ documentFormattingProvider: true }, formatDocument);

    expect(press(view)).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let total = 1;'));
    expect(formatDocument).toHaveBeenCalledWith({
      options: { tabSize: 2, insertSpaces: true },
      textDocument: { uri: URI },
    });
  });

  test('skips server unable to format', async () => {
    const formatDocument = vi.fn(() => []);
    const view = await open({}, formatDocument);

    expect(press(view)).toBe(false);
    await new Promise(requestAnimationFrame);

    expect(formatDocument).not.toHaveBeenCalled();
  });

  test('formats each selection as range', async () => {
    const formatDocument = vi.fn(() => []);
    const formatRange = vi.fn(formatLines);
    const view = await open(CAPABILITIES, formatDocument, formatRange, LINES);
    const [first, , third] = [1, 2, 3].map((n) => view.state.doc.line(n));
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(first.from, first.to),
        EditorSelection.range(third.from, third.to),
      ]),
    });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let a = 1;\nlet  b=2;\nlet c = 3;'));
    expect(formatRange).toHaveBeenCalledTimes(2);
    expect(formatRange.mock.calls[0][0].range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 9 },
    });
    expect(formatDocument).not.toHaveBeenCalled();
  });

  test('formats document as one range for range-only server', async () => {
    const formatRange = vi.fn(formatLines);
    const view = await open({ documentRangeFormattingProvider: true }, () => [], formatRange, LINES);

    expect(press(view)).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let a = 1;\nlet b = 2;\nlet c = 3;'));
    expect(formatRange.mock.calls[0][0].range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 2, character: 9 },
    });
  });

  test('skips selection for server unable to format ranges', async () => {
    const formatDocument = vi.fn(() => []);
    const formatRange = vi.fn(formatLines);
    const view = await open({ documentFormattingProvider: true }, formatDocument, formatRange);
    view.dispatch({ selection: { anchor: 0, head: 3 } });

    expect(press(view)).toBe(false);
    await new Promise(requestAnimationFrame);

    expect(formatDocument).not.toHaveBeenCalled();
    expect(formatRange).not.toHaveBeenCalled();
  });
});
