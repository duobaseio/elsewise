import { afterEach, describe, expect, test, vi } from 'vitest';
import { SortedSet } from '@/plugins/sorted-set';

interface Item {
  readonly id: string;
  readonly order?: number;
  readonly label?: string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add', () => {
  test('adds items until disposed, notifying', () => {
    const notify = vi.fn();
    const items = new SortedSet<Item>('Item', notify);
    const dispose = items.add([{ id: 'a' }]);

    expect(items.items).toEqual([{ id: 'a' }]);

    dispose();

    expect(items.items).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  test('sorts by order, then id', () => {
    const items = new SortedSet<Item>('Item', () => {});
    items.add([
      { id: 'c', order: 20 },
      { id: 'b', order: 10 },
    ]);
    items.add([{ id: 'a', order: 10 }]);

    expect(items.items.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  test('puts unordered last, by id', () => {
    const items = new SortedSet<Item>('Item', () => {});
    items.add([{ id: 'b' }, { id: 'a' }, { id: 'c', order: 30 }]);

    expect(items.items.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  test('keeps first of duplicate id, warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = new SortedSet<Item>('Item', () => {});
    items.add([{ id: 'a', label: 'first' }]);
    items.add([{ id: 'a', label: 'second' }]);

    expect(items.items).toEqual([{ id: 'a', label: 'first' }]);
    expect(warn).toHaveBeenCalledWith('Item a was already added');
  });

  test('restores duplicate once first is disposed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = new SortedSet<Item>('Item', () => {});
    const dispose = items.add([{ id: 'a', label: 'first' }]);
    items.add([{ id: 'a', label: 'second' }]);

    dispose();

    expect(items.items).toEqual([{ id: 'a', label: 'second' }]);
  });

  test('removes only disposed addition when added twice', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = new SortedSet<Item>('Item', () => {});
    const added = [{ id: 'a' }];
    const dispose = items.add(added);
    items.add(added);

    dispose();

    expect(items.items).toEqual([{ id: 'a' }]);
  });
});
