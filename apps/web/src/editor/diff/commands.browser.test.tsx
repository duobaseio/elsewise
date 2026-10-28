import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, DEFAULT_DIFF_SOURCES, EDITOR_DOCUMENT, type EditorDocumentLayout } from '@elsewise/plugin';
import { afterEach, describe, expect, test } from 'vitest';
import {
  EDITOR_BRANCH_DIFF,
  EDITOR_CLOSE_DIFF,
  EDITOR_NEXT_CHUNK,
  EDITOR_PREVIOUS_CHUNK,
  EDITOR_SPLIT_DIFF,
  EDITOR_UNCOMMITTED_DIFF,
  EDITOR_UNIFIED_DIFF,
  EDITOR_UNSTAGED_DIFF,
} from '@/editor/diff/commands';
import { DiffState } from '@/editor/diff/diff';
import { unifiedDiff } from '@/editor/layouts/unified-layout';
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

describe('EDITOR_NEXT_CHUNK', () => {
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

  test('disables without chunks', () => {
    const { view, commands } = open();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: BASE } });

    expect(EDITOR_NEXT_CHUNK.enabled?.(commands.application, view)).toBe(false);
  });
});

describe('EDITOR_PREVIOUS_CHUNK', () => {
  test('steps back through chunks, wrapping', () => {
    const { view, commands } = open();

    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(6);
    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(4);
  });

  test('disables without chunks', () => {
    const { view, commands } = open();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: BASE } });

    expect(EDITOR_PREVIOUS_CHUNK.enabled?.(commands.application, view)).toBe(false);
  });
});

describe('EDITOR_UNSTAGED_DIFF', () => {
  test('is active while comparing with unstaged', () => {
    const { view, commands } = open(DEFAULT_DIFF_SOURCES.unstaged);

    expect(EDITOR_UNSTAGED_DIFF.active?.(commands.application, view)).toBe(true);
    expect(EDITOR_UNCOMMITTED_DIFF.active?.(commands.application, view)).toBe(false);
  });

  test('hides and disables on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(EDITOR_UNSTAGED_DIFF.shown?.(commands.application, view)).toBe(false);
    expect(EDITOR_UNSTAGED_DIFF.enabled?.(commands.application, view)).toBe(false);
  });

  test('shows and enables on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(EDITOR_UNSTAGED_DIFF.shown?.(commands.application, view)).toBe(true);
      expect(EDITOR_UNSTAGED_DIFF.enabled?.(commands.application, view)).toBe(true);
    }
  });
});

describe('EDITOR_UNCOMMITTED_DIFF', () => {
  test('hides and disables on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(EDITOR_UNCOMMITTED_DIFF.shown?.(commands.application, view)).toBe(false);
    expect(EDITOR_UNCOMMITTED_DIFF.enabled?.(commands.application, view)).toBe(false);
  });

  test('shows and enables on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(EDITOR_UNCOMMITTED_DIFF.shown?.(commands.application, view)).toBe(true);
      expect(EDITOR_UNCOMMITTED_DIFF.enabled?.(commands.application, view)).toBe(true);
    }
  });
});

describe('EDITOR_BRANCH_DIFF', () => {
  test('hides and disables on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(EDITOR_BRANCH_DIFF.shown?.(commands.application, view)).toBe(false);
    expect(EDITOR_BRANCH_DIFF.enabled?.(commands.application, view)).toBe(false);
  });

  test('shows and enables on target side and in editor', () => {
    for (const { view, commands } of [open('test.source', 'split', SPLIT_TARGET), open(null, 'unified', PLAIN)]) {
      expect(EDITOR_BRANCH_DIFF.shown?.(commands.application, view)).toBe(true);
      expect(EDITOR_BRANCH_DIFF.enabled?.(commands.application, view)).toBe(true);
    }
  });
});

describe('EDITOR_CLOSE_DIFF', () => {
  test('hides without source', () => {
    const { view, commands } = open(null);

    expect(EDITOR_CLOSE_DIFF.shown?.(commands.application, view)).toBe(false);
  });

  test('hides and disables on base side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_BASE);

    expect(EDITOR_CLOSE_DIFF.shown?.(commands.application, view)).toBe(false);
    expect(EDITOR_CLOSE_DIFF.enabled?.(commands.application, view)).toBe(false);
  });

  test('shows and enables on target side', () => {
    const { view, commands } = open('test.source', 'split', SPLIT_TARGET);

    expect(EDITOR_CLOSE_DIFF.shown?.(commands.application, view)).toBe(true);
    expect(EDITOR_CLOSE_DIFF.enabled?.(commands.application, view)).toBe(true);
  });

  test('enables in editor', () => {
    const { view, commands } = open(null, 'unified', PLAIN);

    expect(EDITOR_CLOSE_DIFF.enabled?.(commands.application, view)).toBe(true);
  });

  test('clears source', () => {
    const { view, diff, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.close, view);

    expect(diff.source).toBeNull();
  });
});

describe('EDITOR_SPLIT_DIFF', () => {
  test('sets layout', () => {
    const { view, diff, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.split, view);

    expect(diff.layout).toBe('split');
  });

  test('is active in split layout', () => {
    const { view, commands } = open('test.source', 'split');

    expect(EDITOR_SPLIT_DIFF.active?.(commands.application, view)).toBe(true);
    expect(EDITOR_UNIFIED_DIFF.active?.(commands.application, view)).toBe(false);
  });
});

describe('EDITOR_UNIFIED_DIFF', () => {
  test('sets layout', () => {
    const { view, diff, commands } = open('test.source', 'split');
    commands.run(DEFAULT_COMMANDS.editor.diff.unified, view);

    expect(diff.layout).toBe('unified');
  });

  test('is active in unified layout', () => {
    const { view, commands } = open();

    expect(EDITOR_UNIFIED_DIFF.active?.(commands.application, view)).toBe(true);
    expect(EDITOR_SPLIT_DIFF.active?.(commands.application, view)).toBe(false);
  });
});
