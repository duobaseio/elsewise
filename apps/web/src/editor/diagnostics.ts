import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint';
import { type EditorState, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand, type EditorDiagnostic } from '@elsewise/plugin';
import { COMMANDS } from '@/editor/editor-manager';
import { jump } from '@/editor/scroll';

/**
 * The severities from the highest down.
 */
export const SEVERITIES: readonly EditorDiagnostic['severity'][] = ['error', 'warning', 'info', 'hint'];

/**
 * The diagnostics, at their positions in the current document.
 */
export const diagnostics = StateField.define<readonly EditorDiagnostic[]>({
  create: collect,
  update: (value, tr) =>
    tr.docChanged || tr.effects.some((effect) => effect.is(setDiagnosticsEffect)) ? collect(tr.state) : value,
});

function collect(state: EditorState): readonly EditorDiagnostic[] {
  const found: EditorDiagnostic[] = [];
  forEachDiagnostic(state, (diagnostic, from, to) => {
    found.push({ ...diagnostic, from, to });
  });
  return found;
}

export const EDITOR_NEXT_DIAGNOSTIC: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diagnostics.next,
  label: 'Next diagnostic',
  defaultKeys: DEFAULT_KEYS.editor.diagnostics.next,
  run: (_, view) => step(view, true),
};

export const EDITOR_PREVIOUS_DIAGNOSTIC: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diagnostics.previous,
  label: 'Previous diagnostic',
  defaultKeys: DEFAULT_KEYS.editor.diagnostics.previous,
  run: (_, view) => step(view, false),
};

// Moves the cursor to the diagnostic before/after it, grouped by severity.
function step(view: EditorView, next: boolean): boolean {
  const found = view.state.field(diagnostics).filter(({ severity }) => severity !== 'hint');
  const highest = Math.min(...found.map(({ severity }) => SEVERITIES.indexOf(severity)));
  const ordered = found
    .filter(({ severity }) => SEVERITIES.indexOf(severity) === highest)
    .sort((a, b) => a.from - b.from);
  if (ordered.length === 0) {
    return false;
  }

  const head = view.state.selection.main.head;
  const target = next
    ? (ordered.find(({ from }) => from > head) ?? ordered[0])
    : (ordered.findLast(({ from }) => from < head) ?? ordered[ordered.length - 1]);

  jump(view, target);
  view.state.facet(COMMANDS)?.run(DEFAULT_COMMANDS.editor.hover.show, view);
  return true;
}
