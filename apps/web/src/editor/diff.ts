import {
  getChunks,
  getOriginalDoc,
  goToNextChunk,
  goToPreviousChunk,
  unifiedMergeView,
  updateOriginalDoc,
} from '@codemirror/merge';
import { ChangeSet, EditorState, type Extension, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, DEFAULT_DIFF_SOURCES, DEFAULT_KEYS, type EditorCommand } from '@elsewise/plugin';

export const diffSource = StateField.define<string | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiffSource)) {
        value = effect.value;
      }
    }
    return value;
  },
});

export const setDiffSource = StateEffect.define<string | null>();

export const diffLayout = StateField.define<DiffLayout>({
  create: () => 'unified',
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiffLayout)) {
        value = effect.value;
      }
    }
    return value;
  },
});

export const setDiffLayout = StateEffect.define<DiffLayout>();

// TODO: Fine-tuning of appearance and behavior.
export function unifiedDiff(base: string): Extension {
  return unifiedMergeView({ original: base, mergeControls: false });
}

/**
 * Replaces the base of the diff in `view` with `base`.
 */
export function setBase(view: EditorView, base: string): void {
  const original = getOriginalDoc(view.state);
  const changes = ChangeSet.of(
    { from: 0, to: original.length, insert: base },
    original.length,
    view.state.facet(EditorState.lineSeparator),
  );
  view.dispatch({ effects: updateOriginalDoc.of({ doc: changes.apply(original), changes }) });
}

export const UNSTAGED_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.unstaged,
  label: 'Unstaged',
  defaultKeys: DEFAULT_KEYS.editor.diff.unstaged,
  run: (application, view) => {
    application.editor.diffs.set(view, DEFAULT_DIFF_SOURCES.unstaged);
    return true;
  },
};

export const UNCOMMITTED_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.uncommitted,
  label: 'Uncommitted',
  defaultKeys: DEFAULT_KEYS.editor.diff.uncommitted,
  run: (application, view) => {
    application.editor.diffs.set(view, DEFAULT_DIFF_SOURCES.uncommitted);
    return true;
  },
};

export const BRANCH_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.branch,
  label: 'Branch',
  defaultKeys: DEFAULT_KEYS.editor.diff.branch,
  run: (application, view) => {
    application.editor.diffs.set(view, DEFAULT_DIFF_SOURCES.branch);
    return true;
  },
};

export const CLOSE_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.close,
  label: 'Stop comparing',
  defaultKeys: DEFAULT_KEYS.editor.diff.close,
  shown: (_, view) => view.state.field(diffSource, false) != null,
  run: (_, view) => {
    view.dispatch({ effects: setDiffSource.of(null) });
    return true;
  },
};

export const NEXT_CHUNK: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.next,
  label: 'Next change',
  defaultKeys: DEFAULT_KEYS.editor.diff.next,
  shown: (_, view) => getChunks(view.state) !== null,
  run: (_, view) => goToNextChunk(view),
};

export const PREVIOUS_CHUNK: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.previous,
  label: 'Previous change',
  defaultKeys: DEFAULT_KEYS.editor.diff.previous,
  shown: (_, view) => getChunks(view.state) !== null,
  run: (_, view) => goToPreviousChunk(view),
};

export const UNIFIED_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.unified,
  label: 'Unified',
  defaultKeys: DEFAULT_KEYS.editor.diff.unified,
  shown: (_, view) => view.state.field(diffSource, false) != null,
  enabled: (_, view) => view.state.field(diffLayout, false) !== 'unified',
  run: (_, view) => {
    view.dispatch({ effects: setDiffLayout.of('unified') });
    return true;
  },
};

export const SPLIT_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.split,
  label: 'Side by side',
  defaultKeys: DEFAULT_KEYS.editor.diff.split,
  shown: (_, view) => view.state.field(diffSource, false) != null,
  enabled: (_, view) => view.state.field(diffLayout, false) !== 'split',
  run: (_, view) => {
    view.dispatch({ effects: setDiffLayout.of('split') });
    return true;
  },
};
