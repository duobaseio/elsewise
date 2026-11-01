import type { ContextMenuGroup, ContextMenuItem, ContextMenuSubmenuItem, Disposable } from '@elsewise/plugin';

/**
 * A context menu's groups, which plugins add to.
 */
export class ContextMenuManager {
  private added: readonly (readonly ContextMenuGroup[])[];
  private current: readonly ContextMenuGroup[];

  constructor(
    defaults: readonly ContextMenuGroup[],
    private readonly notify: () => void,
  ) {
    this.added = [defaults];
    this.current = this.merge(this.added.flat());
  }

  /**
   * The groups, one per id, in order of first addition.
   */
  get groups(): readonly ContextMenuGroup[] {
    return this.current;
  }

  /**
   * Adds `groups` until the returned disposable is disposed.
   */
  add(groups: readonly ContextMenuGroup[]): Disposable {
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

  // Returns `groups` with those of an id as one: their items in order of addition, and the first defined `order` and
  // `in`.
  private merge(groups: readonly ContextMenuGroup[]): ContextMenuGroup[] {
    const merged = new Map<
      string,
      { order?: number; in?: string; items: (ContextMenuItem | ContextMenuSubmenuItem)[] }
    >();
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
          console.warn(`Context menu group ${group.id} already has order ${existing.order}, ignoring ${group.order}`);
        }
      }

      if (group.in !== undefined) {
        if (existing.in === undefined) {
          existing.in = group.in;
        } else if (existing.in !== group.in) {
          console.warn(`Context menu group ${group.id} is already in ${existing.in}, ignoring ${group.in}`);
        }
      }

      existing.items.push(...group.items);
    }

    return [...merged].map(([id, group]) => ({ id, ...group }));
  }
}
