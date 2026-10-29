import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DiffState } from '@/editor/diff/diff';
import { unifiedDiff } from '@/editor/layouts/unified-layout';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].join('\n');
// Changes `beta` on line 2, deletes `delta` before line 4 and adds `theta` on line 6.
const DOC = ['alpha', 'BETA', 'gamma', 'epsilon', 'zeta', 'theta', 'eta'].join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
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

  test('notifies on edit changing chunks', () => {
    const diff = new DiffState('test.source', 'unified');
    const view = new EditorView({
      state: EditorState.create({ doc: DOC, extensions: [unifiedDiff(BASE), diff.extension] }),
      parent: document.body,
    });
    views.push(view);
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
