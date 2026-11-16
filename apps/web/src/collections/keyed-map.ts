/**
 * A map whose keys are equal when `keyOf` returns equal values for them.
 */
export class KeyedMap<K, V> implements Map<K, V> {
  readonly [Symbol.toStringTag] = 'KeyedMap';
  private readonly map = new Map<string, [K, V]>();

  constructor(private readonly keyOf: (key: K) => readonly unknown[]) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(this.stringify(key))?.[1];
  }

  has(key: K): boolean {
    return this.map.has(this.stringify(key));
  }

  set(key: K, value: V): this {
    this.map.set(this.stringify(key), [key, value]);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(this.stringify(key));
  }

  clear(): void {
    this.map.clear();
  }

  forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.map.values()) {
      callback.call(thisArg, value, key, this);
    }
  }

  *entries(): MapIterator<[K, V]> {
    for (const [key, value] of this.map.values()) {
      yield [key, value];
    }
  }

  *keys(): MapIterator<K> {
    for (const [key] of this.map.values()) {
      yield key;
    }
  }

  *values(): MapIterator<V> {
    for (const [, value] of this.map.values()) {
      yield value;
    }
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  private stringify(key: K): string {
    return JSON.stringify(this.keyOf(key));
  }
}
