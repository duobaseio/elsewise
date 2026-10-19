import { history, undo } from '@codemirror/commands';
import { forceParsing, LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorSelection, EditorState, type Extension, StateEffect } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { toast } from '@elsewise/components/components/toast';
import { PLATFORM } from '@elsewise/components/lib/platform';
import type { EditorFormatter } from '@elsewise/plugin';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { format } from '@/editor/format';
import { commandsExtension } from '../../test/commands';

const DOC = 'let  total=1;';

// Lines that each format to `let x = n;`.
const LINES = 'let  a=1;\nlet  b=2;\nlet  c=3;';

// Returns the changes that format each of `LINES` that `ranges` touch, or all of them.
async function formatLines(view: EditorView, ranges?: readonly { from: number; to: number }[]) {
  const { doc } = view.state;
  const lines = (ranges ?? [{ from: 0, to: doc.length }]).flatMap(({ from, to }) =>
    Array.from({ length: doc.lineAt(to).number - doc.lineAt(from).number + 1 }, (_, i) =>
      doc.line(doc.lineAt(from).number + i),
    ),
  );
  return lines.flatMap((line) => [
    { from: line.from + 3, to: line.from + 5, insert: ' ' },
    { from: line.from + 6, to: line.from + 7, insert: ' = ' },
  ]);
}

let html: LanguageSupport;

beforeAll(async () => {
  html = await (LanguageDescription.matchFilename(languages, 'index.html') as LanguageDescription).load();
});

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

// Opens `doc` with `formatters`, as a plugin's extension adds them.
function open(formatters: readonly EditorFormatter[], doc = DOC, extensions: Extension = []): EditorView {
  const data = formatters.map((formatter) => ({ formatter }));
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        format,
        EditorState.languageData.of(() => data),
        commandsExtension(),
        history(),
        EditorState.allowMultipleSelections.of(true),
        extensions,
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

describe('FORMAT', () => {
  test("applies formatter's changes in one undo step", async () => {
    const view = open([
      {
        format: async () => [
          { from: 3, to: 5, insert: ' ' },
          { from: 10, to: 11, insert: ' = ' },
        ],
      },
    ]);

    expect(press(view)).toBe(true);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let total = 1;'));
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });

  test('says when formatting failed', async () => {
    const add = vi.spyOn(toast, 'add');
    const view = open([{ format: () => Promise.reject(new Error('No formatter')) }]);

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

  test('leaves key without formatter', () => {
    const view = open([]);

    expect(press(view)).toBe(false);
  });

  test('formats only selection', async () => {
    const formatter = vi.fn(formatLines);
    const view = open([{ format: formatter }], LINES);
    const second = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: second.from, head: second.to } });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let  a=1;\nlet b = 2;\nlet  c=3;'));
    expect(formatter).toHaveBeenCalledTimes(1);
    expect(formatter.mock.calls[0][1]).toEqual([{ from: second.from, to: second.to }]);
  });

  test('formats each selection, in one undo step', async () => {
    const view = open([{ format: formatLines }], LINES);
    const [first, , third] = [1, 2, 3].map((n) => view.state.doc.line(n));
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(first.from, first.to),
        EditorSelection.range(third.from, third.to),
      ]),
    });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let a = 1;\nlet  b=2;\nlet c = 3;'));
    undo(view);
    expect(view.state.doc.toString()).toBe(LINES);
  });

  test('applies change shared by two selections once', async () => {
    const view = open([{ format: formatLines }], LINES);
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(7, 8)]),
    });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.line(1).text).toBe('let a = 1;'));
    expect(view.state.doc.toString()).toBe('let a = 1;\nlet  b=2;\nlet  c=3;');
  });

  test('keeps cursor in place through whole-document change', async () => {
    const formatted = 'let a = 1;\nlet  b=2;\nlet c = 3;';
    const view = open([{ format: async (view) => [{ from: 0, to: view.state.doc.length, insert: formatted }] }], LINES);
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from + 5 } });

    press(view);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(formatted));
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from + 5);
  });

  test('applies whole-document change past code edited meanwhile', async () => {
    const { promise, resolve } = Promise.withResolvers<{ from: number; to: number; insert: string }[]>();
    const view = open([{ format: () => promise }], LINES);

    press(view);
    view.dispatch({ changes: { from: view.state.doc.line(2).to, insert: ' // b' } });
    resolve([{ from: 0, to: LINES.length, insert: 'let a = 1;\nlet  b=2;\nlet c = 3;' }]);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('let a = 1;\nlet  b=2; // b\nlet c = 3;'));
  });

  test('uses document language formatter inside nested language', async () => {
    const formatter = vi.fn(async () => []);
    const doc = '<p>a</p>\n<script>\nlet  a=1;\n</script>';
    const view = open([], doc, [html, html.language.data.of({ formatter: { format: formatter } })]);
    forceParsing(view, doc.length);
    view.dispatch({ selection: { anchor: doc.indexOf('let') } });

    expect(press(view)).toBe(true);
    await vi.waitFor(() => expect(formatter).toHaveBeenCalled());
  });

  test('tries formatters lowest order first, those without one last', async () => {
    const last = vi.fn(async () => []);
    const second = vi.fn(async () => []);
    const first = vi.fn(async () => []);
    const view = open([{ format: last }, { order: 20, format: second }, { order: 10, format: first }]);

    press(view);

    await vi.waitFor(() => expect(first).toHaveBeenCalled());
    expect(second).not.toHaveBeenCalled();
    expect(last).not.toHaveBeenCalled();
  });

  test('skips formatter not enabled for selection', async () => {
    const whole = vi.fn(async () => []);
    const ranges = vi.fn(async () => []);
    const view = open([
      { order: 10, enabled: (_, selection) => selection === undefined, format: whole },
      { order: 20, format: ranges },
    ]);
    view.dispatch({ selection: { anchor: 0, head: 3 } });

    press(view);

    await vi.waitFor(() => expect(ranges).toHaveBeenCalled());
    expect(whole).not.toHaveBeenCalled();
  });

  test('leaves key when no formatter is enabled', () => {
    const formatter = vi.fn(async () => []);
    const view = open([{ enabled: () => false, format: formatter }]);

    expect(press(view)).toBe(false);
    expect(formatter).not.toHaveBeenCalled();
  });

  test("doesn't format read-only document", () => {
    const formatter = vi.fn(async () => []);
    const view = open([{ format: formatter }]);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });

    expect(press(view)).toBe(false);
    expect(formatter).not.toHaveBeenCalled();
  });

  test('drops changes to code edited meanwhile', async () => {
    const { promise, resolve } = Promise.withResolvers<{ from: number; to: number; insert: string }[]>();
    const view = open([{ format: () => promise }]);

    press(view);
    view.dispatch({ changes: { from: 4, to: 4, insert: 'x' } });
    resolve([{ from: 3, to: 5, insert: ' ' }]);
    await new Promise(requestAnimationFrame);

    expect(view.state.doc.toString()).toBe('let x total=1;');
  });

  test('applies changes past code edited meanwhile', async () => {
    const { promise, resolve } = Promise.withResolvers<{ from: number; to: number; insert: string }[]>();
    const view = open([{ format: () => promise }]);

    press(view);
    view.dispatch({ changes: { from: 0, to: 0, insert: '// a\n' } });
    resolve([{ from: 3, to: 5, insert: ' ' }]);

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('// a\nlet total=1;'));
  });
});
