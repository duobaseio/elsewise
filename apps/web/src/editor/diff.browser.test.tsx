import { getChunks } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DiffLayout } from '@elsewise/bridge';
import { DEFAULT_COMMANDS } from '@elsewise/plugin';
import { afterEach, describe, expect, test } from 'vitest';
import { CLOSE_DIFF, diffLayout, diffSource, SPLIT_DIFF, setBase, UNIFIED_DIFF, unifiedDiff } from '@/editor/diff';
import { builtInCommands, commandsExtension } from '../../test/commands';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].join('\n');
// Changes `beta` on line 2, deletes `delta` before line 4 and adds `theta` on line 6.
const DOC = ['alpha', 'BETA', 'gamma', 'epsilon', 'zeta', 'theta', 'eta'].join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` diffed against `BASE`, against the source with `source` in `layout`, and returns it with the built-in
// commands.
function open(source: string | null = 'test.source', layout: DiffLayout = 'unified') {
  const commands = builtInCommands();
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [
        unifiedDiff(BASE),
        diffSource.init(() => source),
        diffLayout.init(() => layout),
        commandsExtension(commands),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  return { view, commands };
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

describe('setBase', () => {
  test('replaces chunks', () => {
    const { view } = open();
    setBase(view, DOC);

    expect(getChunks(view.state)?.chunks).toEqual([]);
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
});

describe('PREVIOUS_CHUNK', () => {
  test('steps back through chunks, wrapping', () => {
    const { view, commands } = open();

    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(6);
    commands.run(DEFAULT_COMMANDS.editor.diff.previous, view);
    expect(line(view)).toBe(4);
  });
});

describe('CLOSE_DIFF', () => {
  test('is hidden without source', () => {
    const { view, commands } = open(null);

    expect(CLOSE_DIFF.shown?.(commands.application, view, null)).toBe(false);
  });

  test('clears source', () => {
    const { view, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.close, view);

    expect(view.state.field(diffSource)).toBeNull();
  });
});

describe('SPLIT_DIFF', () => {
  test('sets layout', () => {
    const { view, commands } = open();
    commands.run(DEFAULT_COMMANDS.editor.diff.split, view);

    expect(view.state.field(diffLayout)).toBe('split');
  });

  test('is disabled in split layout', () => {
    const { view, commands } = open('test.source', 'split');

    expect(SPLIT_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });
});

describe('UNIFIED_DIFF', () => {
  test('sets layout', () => {
    const { view, commands } = open('test.source', 'split');
    commands.run(DEFAULT_COMMANDS.editor.diff.unified, view);

    expect(view.state.field(diffLayout)).toBe('unified');
  });

  test('is disabled in unified layout', () => {
    const { view, commands } = open();

    expect(UNIFIED_DIFF.enabled?.(commands.application, view, null)).toBe(false);
  });
});
