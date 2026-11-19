import type { Disposable } from '@elsewise/daemon-plugin';
import type { AgentRegistry, McpServerRegistry } from '../agent/registry';

/**
 * What plugins add to the daemon.
 */
export interface Registries {
  readonly agents: AgentRegistry;
  readonly mcpServers: McpServerRegistry;
}

/**
 * A registry of items plugins have added.
 */
export class Registry<T> {
  readonly #items = new Map<string, T>();
  readonly #taken: (key: string) => string;
  readonly #sortKey: (item: T) => string;

  constructor(taken: (key: string) => string, sortKey: (item: T) => string) {
    this.#taken = taken;
    this.#sortKey = sortKey;
  }

  /**
   * Adds `item` under `key`.
   *
   * Throws the error `taken` describes if the key has an item.
   */
  add(key: string, item: T): Disposable {
    if (this.#items.has(key)) {
      throw new Error(this.#taken(key));
    }

    this.#items.set(key, item);
    return () => {
      if (this.#items.get(key) === item) {
        this.#items.delete(key);
      }
    };
  }

  /** Returns the item. */
  get(key: string): T | undefined {
    return this.#items.get(key);
  }

  /** Returns every key and its item sorted by the item's sort key. */
  entries(): [key: string, item: T][] {
    return [...this.#items].sort(([, a], [, b]) => this.#sortKey(a).localeCompare(this.#sortKey(b)));
  }
}
