import { expect, test } from 'vitest';
import { Registry } from './registry';

interface Item {
  readonly label: string;
}

function registry(): Registry<Item> {
  return new Registry<Item>(
    (key) => `${key} is taken.`,
    (item) => item.label,
  );
}

test('returns the item added under a key', () => {
  const items = registry();
  const ant = { label: 'Ant' };
  items.add('a', ant);

  expect(items.get('a')).toBe(ant);
  expect(items.get('b')).toBeUndefined();
});

test('returns every key and its item sorted by the sort key', () => {
  const items = registry();
  const zebra = { label: 'Zebra' };
  const ant = { label: 'Ant' };
  items.add('1', zebra);
  items.add('2', ant);

  expect(items.entries()).toEqual([
    ['2', ant],
    ['1', zebra],
  ]);
});

test('refuses a key that has an item', () => {
  const items = registry();
  const ant = { label: 'Ant' };
  items.add('a', ant);

  expect(() => items.add('a', { label: 'Other' })).toThrow('a is taken.');
  expect(items.get('a')).toBe(ant);
});

test('removes an item when its disposable is called', async () => {
  const items = registry();
  const dispose = items.add('a', { label: 'Ant' });

  await dispose();

  expect(items.get('a')).toBeUndefined();
  expect(items.entries()).toEqual([]);
});

test('keeps the item added under a key after an earlier disposable for that key is called again', async () => {
  const items = registry();
  const dispose = items.add('a', { label: 'Ant' });
  await dispose();
  const bee = { label: 'Bee' };
  items.add('a', bee);

  await dispose();

  expect(items.get('a')).toBe(bee);
});
