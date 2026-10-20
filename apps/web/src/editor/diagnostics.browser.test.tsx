import { foldEffect, foldedRanges } from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DEFAULT_COMMANDS, type EditorDiagnostic } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { hover } from '@/editor/hover';
import { builtInCommands, commandsExtension } from '../../test/commands';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` in an editor 200px high with `diagnostics`, and returns it with the built-in commands.
function open(diagnostics: EditorDiagnostic[]) {
  const commands = builtInCommands();
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [hover(), commandsExtension(commands), EditorView.theme({ '&': { height: '200px' } })],
    }),
    parent: document.body,
  });
  view.dispatch(setDiagnostics(view.state, diagnostics));
  views.push(view);
  return { view, commands };
}

// Returns a diagnostic over the `line`th line of `DOC`, from 1.
function at(line: number, severity: EditorDiagnostic['severity'] = 'error') {
  const from = DOC.indexOf(`line ${line}\n`);
  return { from, to: from + `line ${line}`.length, severity, message: `${severity} ${line}` };
}

const NEXT = DEFAULT_COMMANDS.editor.diagnostics.next;
const PREVIOUS = DEFAULT_COMMANDS.editor.diagnostics.previous;

describe('NEXT_DIAGNOSTIC', () => {
  test('steps through highest severity, wrapping', () => {
    const { view, commands } = open([at(5, 'warning'), at(20), at(10)]);

    commands.run(NEXT, view);
    expect(view.state.selection.main.head).toBe(at(10).from);
    commands.run(NEXT, view);
    expect(view.state.selection.main.head).toBe(at(20).from);
    commands.run(NEXT, view);
    expect(view.state.selection.main.head).toBe(at(10).from);
  });

  test('falls back to lower severity', () => {
    const { view, commands } = open([at(5, 'hint'), at(3, 'info')]);

    commands.run(NEXT, view);
    expect(view.state.selection.main.head).toBe(at(3).from);
  });

  test('scrolls to and shows diagnostic, unfolding it', async () => {
    const { view, commands } = open([at(100)]);
    view.dispatch({ effects: foldEffect.of({ from: DOC.indexOf('line 90'), to: DOC.indexOf('line 110') }) });

    commands.run(NEXT, view);

    expect(foldedRanges(view.state).size).toBe(0);
    const coords = view.coordsAtPos(at(100).from);
    const bounds = view.scrollDOM.getBoundingClientRect();
    expect(coords?.top).toBeGreaterThan(bounds.top);
    expect(coords?.bottom).toBeLessThan(bounds.bottom);
    await vi.waitFor(() =>
      expect(view.dom.querySelector('.cm-tooltip-hover .cm-diagnosticMessage')?.textContent).toBe('error 100'),
    );
  });

  test('does nothing without diagnostics, hints aside', () => {
    const { view, commands } = open([at(5, 'hint')]);

    expect(commands.run(NEXT, view)).toBe(false);
    expect(view.state.selection.main.head).toBe(0);
  });
});

describe('PREVIOUS_DIAGNOSTIC', () => {
  test('steps back through highest severity, wrapping', () => {
    const { view, commands } = open([at(5, 'warning'), at(20), at(10)]);

    commands.run(PREVIOUS, view);
    expect(view.state.selection.main.head).toBe(at(20).from);
    commands.run(PREVIOUS, view);
    expect(view.state.selection.main.head).toBe(at(10).from);
    commands.run(PREVIOUS, view);
    expect(view.state.selection.main.head).toBe(at(20).from);
  });
});
