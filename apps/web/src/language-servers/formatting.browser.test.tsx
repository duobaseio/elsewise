import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { OS } from '@elsewise/components/lib/os';
import type { LanguageServer } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DocumentRangeFormattingParams } from 'vscode-languageserver-protocol';
import { LanguageServerInstance } from '@/language-servers/language-servers';
import { stubTransport } from '../../test/stub-transport';

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
  format: () => unknown,
  formatRange: (params: DocumentRangeFormattingParams) => unknown = () => [],
  doc = DOC,
): Promise<EditorView> {
  const instance = new LanguageServerInstance(
    {
      id: 'rust',
      name: 'Rust',
      languages: { Rust: 'rust' },
      start: () =>
        stubTransport(capabilities, {
          'textDocument/formatting': format,
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
      extensions: [instance.client.plugin(URI, 'rust'), history(), EditorState.allowMultipleSelections.of(true)],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Presses Mod-Alt-L.
function press(view: EditorView): boolean {
  const event = new KeyboardEvent('keydown', { key: 'l', altKey: true, metaKey: OS === 'mac', ctrlKey: OS !== 'mac' });
  return runScopeHandlers(view, event, 'editor');
}

const CAPABILITIES = { documentFormattingProvider: true, documentRangeFormattingProvider: true };

describe('serverFormatting', () => {
  test("applies the server's edits in one undo step", async () => {
    const view = await open({ documentFormattingProvider: true }, () => [
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }, newText: ' ' },
      { range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, newText: ' = ' },
    ]);

    expect(press(view)).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let total = 1;'));
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('says when formatting failed', async () => {
    const add = vi.spyOn(toast, 'add');
    const view = await open({ documentFormattingProvider: true }, () => Promise.reject(new Error('No formatter')));

    expect(press(view)).toBe(true);

    await vi.waitFor(() => {
      expect(add).toHaveBeenCalledWith({
        type: 'error',
        title: 'Formatting failed',
        description: 'No formatter',
      });
    });
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test("doesn't ask a server that can't format", async () => {
    const format = vi.fn(() => []);
    const view = await open({}, format);

    press(view);
    await new Promise(requestAnimationFrame);

    expect(format).not.toHaveBeenCalled();
  });

  test('formats only the selection', async () => {
    const format = vi.fn(() => []);
    const formatRange = vi.fn(formatLines);
    const view = await open(CAPABILITIES, format, formatRange, LINES);
    const second = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: second.from, head: second.to } });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let  a=1;\nlet b = 2;\nlet  c=3;'));
    expect(formatRange).toHaveBeenCalledTimes(1);
    expect(formatRange.mock.calls[0][0].range).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 9 },
    });
    expect(format).not.toHaveBeenCalled();
  });

  test('formats each selection, in one undo step', async () => {
    const formatRange = vi.fn(formatLines);
    const view = await open(CAPABILITIES, () => [], formatRange, LINES);
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
    undo(view);
    expect(view.state.doc.toString()).toBe(LINES);
  });

  test('applies a change that two selections both get once', async () => {
    const view = await open(CAPABILITIES, () => [], formatLines, LINES);
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(7, 8)]),
    });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.line(1).text).toBe('let a = 1;'));
    expect(view.state.doc.toString()).toBe('let a = 1;\nlet  b=2;\nlet  c=3;');
  });

  test("doesn't format the document instead of a selection when the server can't format ranges", async () => {
    const format = vi.fn(() => []);
    const formatRange = vi.fn(formatLines);
    const view = await open({ documentFormattingProvider: true }, format, formatRange);
    view.dispatch({ selection: { anchor: 0, head: 3 } });

    press(view);
    await new Promise(requestAnimationFrame);

    expect(format).not.toHaveBeenCalled();
    expect(formatRange).not.toHaveBeenCalled();
  });

  test("doesn't format a read-only document", async () => {
    const format = vi.fn(() => []);
    const view = await open({ documentFormattingProvider: true }, format);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });

    press(view);
    await new Promise(requestAnimationFrame);

    expect(format).not.toHaveBeenCalled();
  });
});
