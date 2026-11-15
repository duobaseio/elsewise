import type { EditorDiffSource } from '@elsewise/frontend-plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DiffManager } from '@/editor/diff/diff-manager';

// Returns a source with `id` whose base is empty.
function source(id: string, order?: number, label = id): EditorDiffSource {
  return { id, order, label, base: async () => ({ code: '' }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('adds groups until disposed, notifying', () => {
    const notify = vi.fn();
    const manager = new DiffManager(notify);
    const a = source('a');
    const dispose = manager.add([{ id: 'test', sources: [a] }]);

    expect(manager.groups).toEqual([{ id: 'test', sources: [a] }]);

    dispose();

    expect(manager.groups).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  test('merges groups by id', () => {
    const manager = new DiffManager(() => {});
    const a = source('a');
    const b = source('b');
    manager.add([{ id: 'test', order: 10, sources: [a] }]);
    manager.add([{ id: 'test', sources: [b] }]);

    expect(manager.groups).toEqual([{ id: 'test', order: 10, sources: [a, b] }]);
  });

  test('keeps first order, warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new DiffManager(() => {});
    manager.add([{ id: 'test', order: 10, sources: [] }]);
    manager.add([{ id: 'test', order: 20, sources: [] }]);

    expect(manager.groups.map(({ order }) => order)).toEqual([10]);
    expect(warn).toHaveBeenCalledWith('Diff source group test already has order 10, ignoring 20');
  });

  test('sorts groups by order, then id', () => {
    const manager = new DiffManager(() => {});
    manager.add([
      { id: 'c', order: 20, sources: [] },
      { id: 'b', order: 10, sources: [] },
    ]);
    manager.add([{ id: 'a', order: 10, sources: [] }]);

    expect(manager.groups.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  test('puts unordered groups last, by id', () => {
    const manager = new DiffManager(() => {});
    manager.add([
      { id: 'b', sources: [] },
      { id: 'a', sources: [] },
      { id: 'c', order: 30, sources: [] },
    ]);

    expect(manager.groups.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  test('sorts sources by order, then label', () => {
    const manager = new DiffManager(() => {});
    manager.add([
      {
        id: 'test',
        sources: [source('none', undefined, 'None'), source('c', 10, 'C'), source('b', 10, 'B'), source('a', 5, 'A')],
      },
    ]);

    expect(manager.sources.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'none']);
  });

  test('lists sources in group order', () => {
    const manager = new DiffManager(() => {});
    manager.add([
      { id: 'second', order: 20, sources: [source('b')] },
      { id: 'first', order: 10, sources: [source('a')] },
    ]);

    expect(manager.sources.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  test('keeps first of duplicate id across groups, warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new DiffManager(() => {});
    const first = source('a', undefined, 'first');
    manager.add([{ id: 'test', sources: [first] }]);
    manager.add([{ id: 'other', sources: [source('a', undefined, 'second')] }]);

    expect(manager.sources).toEqual([first]);
    expect(warn).toHaveBeenCalledWith('Diff source a was already added');
  });

  test('restores duplicate once first is disposed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new DiffManager(() => {});
    const dispose = manager.add([{ id: 'test', sources: [source('a', undefined, 'first')] }]);
    const second = source('a', undefined, 'second');
    manager.add([{ id: 'other', sources: [second] }]);

    dispose();

    expect(manager.sources).toEqual([second]);
  });

  test('removes only disposed addition when added twice', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new DiffManager(() => {});
    const a = source('a');
    const added = [{ id: 'test', sources: [a] }];
    const dispose = manager.add(added);
    manager.add(added);

    dispose();

    expect(manager.sources).toEqual([a]);
  });
});
