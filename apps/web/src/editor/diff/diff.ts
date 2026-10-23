import { getChunks, goToNextChunk, goToPreviousChunk, unifiedMergeView } from '@codemirror/merge';
import { type Extension, Facet } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import {
  DEFAULT_COMMANDS,
  DEFAULT_DIFF_SOURCES,
  DEFAULT_KEYS,
  type Disposable,
  EDITOR_DOCUMENT,
  type EditorCommand,
} from '@elsewise/plugin';

/**
 * The editor's diff state, or null in a view outside an editor.
 */
export const EDITOR_DIFF = Facet.define<DiffState, DiffState | null>({ combine: (values) => values[0] ?? null });

/**
 * Which source an editor's file is diffed against, and in which layout.
 *
 * One per editor, shared by its views, since a change of layout replaces them. Commands and plugins read and change it
 * through {@link EDITOR_DIFF}, and the editor renders from it.
 *
 * A change updates the views, so that what they show from it, e.g. whether a toolbar's command is enabled, is
 * evaluated again.
 */
export class DiffState {
  /**
   * The extension that gives a view this state.
   */
  readonly extension: Extension;
  private readonly listeners = new Set<() => void>();
  private readonly views = new Set<EditorView>();
  private currentSource: string | null;
  private currentLayout: DiffLayout;

  constructor(source: string | null, layout: DiffLayout) {
    this.currentSource = source;
    this.currentLayout = layout;
    this.extension = [
      EDITOR_DIFF.of(this),
      ViewPlugin.define((view) => {
        this.views.add(view);
        // Later, since the view is not yet built.
        queueMicrotask(() => this.notifyListeners());
        return {
          update: (update) => {
            if (getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks) {
              this.notifyListeners();
            }
          },
          destroy: () => this.views.delete(view),
        };
      }),
    ];
  }

  /**
   * The id of the source that the file is diffed against, or null if it is not diffed.
   */
  get source(): string | null {
    return this.currentSource;
  }

  set source(source: string | null) {
    if (this.currentSource !== source) {
      this.currentSource = source;
      this.notify();
    }
  }

  /**
   * The layout that the diff is shown in.
   */
  get layout(): DiffLayout {
    return this.currentLayout;
  }

  set layout(layout: DiffLayout) {
    if (this.currentLayout !== layout) {
      this.currentLayout = layout;
      this.notify();
    }
  }

  /**
   * Registers a `listener` that is called when the source or layout changes, a view is added, or a view's chunks
   * change.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.notifyListeners();

    // Later, since the state may change during a view update, when dispatching is not allowed.
    queueMicrotask(() => {
      for (const view of this.views) {
        view.dispatch({});
      }
    });
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Diff listener failed', error);
      }
    }
  }
}

// TODO: Fine-tuning of appearance and behavior.
export function unifiedDiff(base: string): Extension {
  return unifiedMergeView({ original: base, mergeControls: false });
}

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
