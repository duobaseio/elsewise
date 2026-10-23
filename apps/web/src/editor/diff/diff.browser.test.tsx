import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, DEFAULT_DIFF_SOURCES, EDITOR_DOCUMENT, type EditorDocumentLayout } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  BRANCH_DIFF,
  CLOSE_DIFF,
  DiffState,
  NEXT_CHUNK,
  PREVIOUS_CHUNK,
  SPLIT_DIFF,
  UNCOMMITTED_DIFF,
  UNIFIED_DIFF,
  UNSTAGED_DIFF,
  unifiedDiff,
} from '@/editor/diff/diff';
import { builtInCommands, commandsExtension } from '../../../test/commands';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].join('\n');
// Changes `beta` on line 2, deletes `delta` before line 4 and adds `theta` on line 6.
const DOC = ['alpha', 'BETA', 'gamma', 'epsilon', 'zeta', 'theta', 'eta'].join('\n');

const SPLIT_BASE: EditorDocumentLayout = { type: 'split', side: 'base' };
const SPLIT_TARGET: EditorDocumentLayout = { type: 'split', side: 'target' };
const PLAIN: EditorDocumentLayout = { type: 'editor' };

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` diffed against `BASE`, against the source with `source` in `layout`, as a document in `documentLayout` if
// given, and returns it with its diff state and the built-in commands.
function open(
  source: string | null = 'test.source',
  layout: DiffLayout = 'unified',
  documentLayout: EditorDocumentLayout | null = null,
) {
  const commands = builtInCommands();
  const diff = new DiffState(source, layout);
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [
        unifiedDiff(BASE),
        diff.extension,
        commandsExtension(commands),
        documentLayout === null ? [] : EDITOR_DOCUMENT.of({ relativePath: 'test.ts', layout: documentLayout }),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return { view, diff, commands };
}

// Returns the line number of the cursor, from 1.
function line(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

describe('unifiedDiff', () => {
  test('marks added lines, and shows deleted ones in chunks', () => {
    const { view } = open();

    expect([...view.dom.querySelectorAll('.cm-changedLine')].map((element) => element.textContent)).toEqual([
      'BETA',
      'theta',
    ]);
    expect(
      [...view.dom.querySelectorAll('.cm-deletedChunk .cm-deletedLine')].map((element) => element.textContent),
    ).toEqual(['beta', 'delta']);
  });
});

describe('NEXT_CHUNK', () => {
  test('steps through chunks, wrapping', () => {
    const { view, commands } = open();

    commands.run(DEFAULT_COMMANDS.editor.diff.next, view);
    expect(line(view)).toBe(2);
    commands.run(DEFAULT_COMMANDS.editor.diff.next, view);
    expect(line(view)).toBe(4);
    commands.run(DEFAULT_COMMANDS.editor.diff.next, view);
    expect(line(view)).toBe(6);
    commands.run(DEFAULT_COMMANDS.editor.diff.next, view);
    expect(line(view)).toBe(2);
  });

  test('is disabled without changes', () => {
    const { view, commands } = open();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: BASE } });

    expect(NEXT_CHUNK.enabled?.(commands.application, view, null)).toBe(false);
  });
});

describe('PREVIOUS_CHUNK', () => {
  test('steps back through chunks, wrapping', () => {
    const { view, commands } = open();

    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(6);
    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(4);
  });

  test('is disabled without changes', () => {
    const { view, commands } = open();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: BASE } });

    expect(PREVIOUS_CHUNK.enabled?.(commands.application, view, null)).toBe(false);
  });
});

describe('UNSTAGED_DIFF', () => {
  test('is active while comparing with unstaged', () => {
    const { view, commands } = open(DEFAULT_DIFF_SOURCES.unstaged);

    expect(UNSTAGED_DIFF.active?.(commands.application, view, null)).toBe(true);
    expect(UNCOMMITTED_DIFF.active?.(commands.application, view, null)).toBe(false);
  });

  test('is hidden and disabled on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(UNSTAGED_DIFF.shown?.(commands.application, view, null)).toBe(false);
    expect(UNSTAGED_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });

  test('is shown and enabled on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(UNSTAGED_DIFF.shown?.(commands.application, view, null)).toBe(true);
      expect(UNSTAGED_DIFF.enabled?.(commands.application, view, null)).toBe(true);
    }
  });
});

describe('UNCOMMITTED_DIFF', () => {
  test('is hidden and disabled on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(UNCOMMITTED_DIFF.shown?.(commands.application, view, null)).toBe(false);
    expect(UNCOMMITTED_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });

  test('is shown and enabled on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(UNCOMMITTED_DIFF.shown?.(commands.application, view, null)).toBe(true);
      expect(UNCOMMITTED_DIFF.enabled?.(commands.application, view, null)).toBe(true);
    }
  });
});

describe('BRANCH_DIFF', () => {
  test('is hidden and disabled on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(BRANCH_DIFF.shown?.(commands.application, view, null)).toBe(false);
    expect(BRANCH_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });

  test('is shown and enabled on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(BRANCH_DIFF.shown?.(commands.application, view, null)).toBe(true);
      expect(BRANCH_DIFF.enabled?.(commands.application, view, null)).toBe(true);
    }
  });
});

describe('CLOSE_DIFF', () => {
  test('is hidden without source', () => {
    const { view, commands } = open(null);

    expect(CLOSE_DIFF.shown?.(commands.application, view, null)).toBe(false);
  });

  test('is hidden and disabled on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(CLOSE_DIFF.shown?.(commands.application, view, null)).toBe(false);
    expect(CLOSE_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });

  test('is shown and enabled on target side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_TARGET);

    expect(CLOSE_DIFF.shown?.(commands.application, view, null)).toBe(true);
    expect(CLOSE_DIFF.enabled?.(commands.application, view, null)).toBe(true);
  });

  test('is enabled in editor', () => {
    const { view, commands } = open(null, 'unified', PLAIN);

    expect(CLOSE_DIFF.enabled?.(commands.application, view, null)).toBe(true);
  });

  test('clears source', () => {
    const { view, diff, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.close, view);

    expect(diff.source).toBeNull();
  });
});

describe('SPLIT_DIFF', () => {
  test('sets layout', () => {
    const { view, diff, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.split, view);

    expect(diff.layout).toBe('split');
  });

  test('is active in split layout', () => {
    const { view, commands } = open('test.source', 'split');

    expect(SPLIT_DIFF.active?.(commands.application, view, null)).toBe(true);
    expect(UNIFIED_DIFF.active?.(commands.application, view, null)).toBe(false);
  });
});

describe('UNIFIED_DIFF', () => {
  test('sets layout', () => {
    const { view, diff, commands } = open('test.source', 'split');
    commands.run(DEFAULT_COMMANDS.editor.diff.unified, view);

    expect(diff.layout).toBe('unified');
  });

  test('is active in unified layout', () => {
    const { view, commands } = open();

    expect(UNIFIED_DIFF.active?.(commands.application, view, null)).toBe(true);
    expect(SPLIT_DIFF.active?.(commands.application, view, null)).toBe(false);
  });
});

describe('DiffState', () => {
  test('notifies on change', () => {
    const diff = new DiffState(null, 'unified');
    const listener = vi.fn();
    diff.subscribe(listener);

    diff.source = 'test.source';
    diff.source = 'test.source';
    diff.layout = 'split';

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('notifies on added view', async () => {
    const diff = new DiffState('test.source', 'unified');
    const listener = vi.fn();
    diff.subscribe(listener);

    views.push(new EditorView({ state: EditorState.create({ extensions: diff.extension }), parent: document.body }));

    await expect.poll(() => listener.mock.calls.length).toBe(1);
  });

  test('notifies on edit that changes chunks', () => {
    const { view, diff } = open();
    const listener = vi.fn();
    diff.subscribe(listener);

    view.dispatch({ selection: { anchor: 1 } });
    expect(listener).not.toHaveBeenCalled();
    view.dispatch({ changes: { from: 0, insert: 'omega\n' } });

    expect(listener).toHaveBeenCalledOnce();
  });

  test('updates views after change', async () => {
    const diff = new DiffState(null, 'unified');
    const update = vi.fn();
    const view = new EditorView({
      state: EditorState.create({ extensions: [diff.extension, EditorView.updateListener.of(update)] }),
      parent: document.body,
    });
    views.push(view);
    // Waits for the updates of the view's first measurements.
    await new Promise((resolve) => setTimeout(resolve, 100));
    update.mockClear();

    diff.layout = 'split';

    await expect.poll(() => update.mock.calls.length).toBe(1);
  });
});
