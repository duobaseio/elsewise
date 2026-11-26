import type { Disposable } from '@elsewise/frontend-plugin';

interface MenuGroup<Item> {
  readonly id: string;
  readonly order?: number;
  readonly in?: string;
  readonly items: readonly Item[];
}

/**
 * A menu's groups, which plugins add to. Its warnings call the menu by `name`, e.g. `Context menu`.
 */
export class MenuManager<Item> {
  private added: readonly (readonly MenuGroup<Item>[])[];
  private current: readonly MenuGroup<Item>[];

  constructor(
    defaults: readonly MenuGroup<Item>[],
    private readonly notify: () => void,
    private readonly name: string,
  ) {
    this.added = [defaults];
    this.current = this.merge(this.added.flat());
  }

  /**
   * The groups, one per id, in order of first addition.
   */
  get groups(): readonly MenuGroup<Item>[] {
    return this.current;
  }

  /**
   * Adds `groups` until the returned disposable is disposed.
   */
  add(groups: readonly MenuGroup<Item>[]): Disposable {
    const added = [...groups];
    this.added = [...this.added, added];
    this.current = this.merge(this.added.flat());
    this.notify();
    return () => {
      this.added = this.added.filter((other) => other !== added);
      this.current = this.merge(this.added.flat());
      this.notify();
    };
  }

  // Merges the groups that share an id. Their items stay in order of addition, and `order` and `in` come from the first
  // group that sets them.
  private merge(groups: readonly MenuGroup<Item>[]): MenuGroup<Item>[] {
    const merged = new Map<string, { order?: number; in?: string; items: Item[] }>();
    for (const group of groups) {
      const existing = merged.get(group.id);
      if (existing === undefined) {
        merged.set(group.id, {
          ...(group.order === undefined ? {} : { order: group.order }),
          ...(group.in === undefined ? {} : { in: group.in }),
          items: [...group.items],
        });
        continue;
      }

      if (group.order !== undefined) {
        if (existing.order === undefined) {
          existing.order = group.order;
        } else if (existing.order !== group.order) {
          console.warn(`${this.name} group ${group.id} already has order ${existing.order}, ignoring ${group.order}`);
        }
      }

      if (group.in !== undefined) {
        if (existing.in === undefined) {
          existing.in = group.in;
        } else if (existing.in !== group.in) {
          console.warn(`${this.name} group ${group.id} is already in ${existing.in}, ignoring ${group.in}`);
        }
      }

      existing.items.push(...group.items);
    }

    return Array.from(merged, ([id, group]) => ({ id, ...group }));
  }
}
