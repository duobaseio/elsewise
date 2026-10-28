import type { EditorDiffSource } from '@elsewise/plugin';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DiffManager } from '@/editor/diff/diff-manager';

// Returns a source with `id` whose base is empty.
function source(id: string): EditorDiffSource {
  return { id, label: id, base: async () => ({ code: '' }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('appends sources until disposed', () => {
    const manager = new DiffManager(() => {});
    const first = [source('a'), source('b')];
    const second = [source('c')];
    const dispose = manager.add(first);
    manager.add(second);

    expect(manager.sources).toEqual([...first, ...second]);

    dispose();

    expect(manager.sources).toEqual(second);
  });

  test('rejects existing id, warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new DiffManager(() => {});
    const original = source('same');
    manager.add([original]);
    manager.add([{ ...source('same'), label: 'Other' }]);

    expect(manager.sources).toEqual([original]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('same'));
  });

  test('notifies on addition and disposal', () => {
    const notify = vi.fn();
    const manager = new DiffManager(notify);
    const dispose = manager.add([source('a')]);
    dispose();

    expect(notify).toHaveBeenCalledTimes(2);
  });
});
