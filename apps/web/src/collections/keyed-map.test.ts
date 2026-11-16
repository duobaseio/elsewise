import { describe, expect, test } from 'vitest';
import { KeyedMap } from '@/collections/keyed-map';

// A map keyed by daemon and session, ignoring the rest of the id.
function sessions() {
  return new KeyedMap<{ daemon: string; session: string; name?: string }, number>((id) => [id.daemon, id.session]);
}

describe('get', () => {
  test('finds equal key', () => {
    const map = sessions().set({ daemon: 'local', session: 'tokyo' }, 1);

    expect(map.get({ daemon: 'local', session: 'tokyo', name: 'Build' })).toBe(1);
    expect(map.get({ daemon: 'remote', session: 'tokyo' })).toBeUndefined();
  });
});

describe('delete', () => {
  test('removes equal key', () => {
    const map = sessions().set({ daemon: 'local', session: 'tokyo' }, 1);

    expect(map.delete({ daemon: 'local', session: 'tokyo' })).toBe(true);
    expect(map.has({ daemon: 'local', session: 'tokyo' })).toBe(false);
  });
});

describe('entries', () => {
  test('returns keys as set', () => {
    const key = { daemon: 'local', session: 'tokyo' };
    const map = sessions().set(key, 1);

    expect([...map]).toEqual([[key, 1]]);
    expect([...map.keys()]).toEqual([key]);
    expect([...map.values()]).toEqual([1]);
    expect(map.size).toBe(1);
  });
});
