import type { Disposable } from '@elsewise/frontend-plugin';

/**
 * The items that plugins added, one per id, in order: lowest `order` first and by id when equal, those without an order
 * last.
 */
export class OrderedItems<T extends { readonly id: string; readonly order?: number }> {
  private added: readonly (readonly T[])[] = [];
  private current: readonly T[] = [];

  /**
   * Calls `onChange` when items are added or removed, and names them `kind` in warnings, e.g. `Project icon`.
   */
  constructor(
    private readonly kind: string,
    private readonly onChange: () => void,
  ) {}

  get items(): readonly T[] {
    return this.current;
  }

  add(items: readonly T[]): Disposable {
    const added = [...items];
    this.added = [...this.added, added];
    this.update();
    return () => {
      this.added = this.added.filter((other) => other !== added);
      this.update();
    };
  }

  private update() {
    const ids = new Set<string>();
    const items: T[] = [];
    for (const item of this.added.flat()) {
      if (ids.has(item.id)) {
        console.warn(`${this.kind} ${item.id} was already added`);
        continue;
      }

      ids.add(item.id);
      items.push(item);
    }
    this.current = items.sort(
      (a, b) =>
        (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
    );
    this.onChange();
  }
}
