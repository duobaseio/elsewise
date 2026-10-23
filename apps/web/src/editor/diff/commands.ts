import { getChunks, goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
import type { EditorView } from '@codemirror/view';
import {
  DEFAULT_COMMANDS,
  DEFAULT_DIFF_SOURCES,
  DEFAULT_KEYS,
  EDITOR_DOCUMENT,
  type EditorCommand,
} from '@elsewise/plugin';
import { EDITOR_DIFF } from '@/editor/diff/diff';

export const UNSTAGED_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.unstaged,
  label: 'Unstaged',
  defaultKeys: DEFAULT_KEYS.editor.diff.unstaged,
  shown: (_, view) => !base(view),
  enabled: (_, view) => !base(view),
  active: (_, view) => view.state.facet(EDITOR_DIFF)?.source === DEFAULT_DIFF_SOURCES.unstaged,
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
  shown: (_, view) => !base(view),
  enabled: (_, view) => !base(view),
  active: (_, view) => view.state.facet(EDITOR_DIFF)?.source === DEFAULT_DIFF_SOURCES.uncommitted,
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
  shown: (_, view) => !base(view),
  enabled: (_, view) => !base(view),
  active: (_, view) => view.state.facet(EDITOR_DIFF)?.source === DEFAULT_DIFF_SOURCES.branch,
  run: (application, view) => {
    application.editor.diffs.set(view, DEFAULT_DIFF_SOURCES.branch);
    return true;
  },
};

export const CLOSE_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.close,
  label: 'Close comparison',
  defaultKeys: DEFAULT_KEYS.editor.diff.close,
  shown: (_, view) => !base(view) && view.state.facet(EDITOR_DIFF)?.source != null,
  enabled: (_, view) => !base(view),
  run: (_, view) => {
    const diff = view.state.facet(EDITOR_DIFF);
    if (diff === null) {
      return false;
    }

    diff.source = null;
    return true;
  },
};

export const NEXT_CHUNK: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.next,
  label: 'Next change',
  defaultKeys: DEFAULT_KEYS.editor.diff.next,
  shown: (_, view) => getChunks(view.state) !== null,
  enabled: (_, view) => (getChunks(view.state)?.chunks.length ?? 0) > 0,
  run: (_, view) => goToNextChunk(view),
};

export const PREVIOUS_CHUNK: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.previous,
  label: 'Previous change',
  defaultKeys: DEFAULT_KEYS.editor.diff.previous,
  shown: (_, view) => getChunks(view.state) !== null,
  enabled: (_, view) => (getChunks(view.state)?.chunks.length ?? 0) > 0,
  run: (_, view) => goToPreviousChunk(view),
};

export const UNIFIED_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.unified,
  label: 'Unified',
  defaultKeys: DEFAULT_KEYS.editor.diff.unified,
  shown: (_, view) => view.state.facet(EDITOR_DIFF)?.source != null,
  active: (_, view) => view.state.facet(EDITOR_DIFF)?.layout === 'unified',
  run: (_, view) => {
    const diff = view.state.facet(EDITOR_DIFF);
    if (diff === null) {
      return false;
    }

    diff.layout = 'unified';
    return true;
  },
};

export const SPLIT_DIFF: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.diff.split,
  label: 'Split',
  defaultKeys: DEFAULT_KEYS.editor.diff.split,
  shown: (_, view) => view.state.facet(EDITOR_DIFF)?.source != null,
  active: (_, view) => view.state.facet(EDITOR_DIFF)?.layout === 'split',
  run: (_, view) => {
    const diff = view.state.facet(EDITOR_DIFF);
    if (diff === null) {
      return false;
    }

    diff.layout = 'split';
    return true;
  },
};

function base(view: EditorView): boolean {
  const layout = view.state.facet(EDITOR_DOCUMENT)?.layout;
  return layout?.type === 'split' && layout.side === 'base';
}
