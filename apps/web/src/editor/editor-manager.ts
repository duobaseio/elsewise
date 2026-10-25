import { type Extension, Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type {
  Commands,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSubmenuItem,
  Disposable,
  Editor,
  EditorDocument,
  EditorToolbarItem,
} from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { DEFAULT_CONTEXT_MENU } from '@/editor/default-context-menu';
import { DiffManager } from '@/editor/diff/diff-manager';
import { LanguageManager } from '@/editor/language-manager';

/**
 * The commands that an editor runs.
 */
export const COMMANDS = Facet.define<Commands, Commands | null>({ combine: (values) => values[0] ?? null });

/**
 * The code editor as plugins see it.
 */
export class EditorManager implements Editor {
  readonly diffs = new DiffManager(() => this.notify());
  readonly languages = new LanguageManager(() => this.notify());
  private readonly listeners = new Set<() => void>();
  private current: EditorView | null = null;
  private addedExtensions: readonly (readonly (Extension | ((document: EditorDocument) => Extension))[])[] = [];
  private currentExtensions: readonly (Extension | ((document: EditorDocument) => Extension))[] = [];
  private addedContextMenu: readonly (readonly ContextMenuGroup[])[] = [DEFAULT_CONTEXT_MENU];
  private currentContextMenu: readonly ContextMenuGroup[] = this.merge(this.addedContextMenu.flat());
  private addedToolbarItems: readonly (readonly EditorToolbarItem[])[] = [];
  private currentToolbarItems: readonly EditorToolbarItem[] = [];

  get active(): EditorView | null {
    return this.current;
  }

  /**
   * Makes `view` the active editor.
   */
  activate(view: EditorView): void {
    if (this.current !== view) {
      this.current = view;
      this.notify();
    }
  }

  /**
   * Makes the active editor null if it is `view`.
   */
  deactivate(view: EditorView): void {
    if (this.current === view) {
      this.current = null;
      this.notify();
    }
  }

  get extensions(): readonly (Extension | ((document: EditorDocument) => Extension))[] {
    return this.currentExtensions;
  }

  addExtensions(extensions: readonly (Extension | ((document: EditorDocument) => Extension))[]): Disposable {
    const added = [...extensions];
    this.addedExtensions = [...this.addedExtensions, added];
    this.currentExtensions = this.addedExtensions.flat();
    this.notify();
    return () => {
      this.addedExtensions = this.addedExtensions.filter((other) => other !== added);
      this.currentExtensions = this.addedExtensions.flat();
      this.notify();
    };
  }

  /**
   * The context menu's groups, one per id, in order of first addition.
   */
  get contextMenu(): readonly ContextMenuGroup[] {
    return this.currentContextMenu;
  }

  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable {
    const added = [...groups];
    this.addedContextMenu = [...this.addedContextMenu, added];
    this.currentContextMenu = this.merge(this.addedContextMenu.flat());
    this.notify();
    return () => {
      this.addedContextMenu = this.addedContextMenu.filter((other) => other !== added);
      this.currentContextMenu = this.merge(this.addedContextMenu.flat());
      this.notify();
    };
  }

  /**
   * The toolbar items that plugins added, in order of addition.
   */
  get toolbarItems(): readonly EditorToolbarItem[] {
    return this.currentToolbarItems;
  }

  addToolbarItems(items: readonly EditorToolbarItem[]): Disposable {
    const added = [...items];
    this.addedToolbarItems = [...this.addedToolbarItems, added];
    this.currentToolbarItems = this.addedToolbarItems.flat();
    this.notify();
    return () => {
      this.addedToolbarItems = this.addedToolbarItems.filter((other) => other !== added);
      this.currentToolbarItems = this.addedToolbarItems.flat();
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

  /**
   * Registers a `listener` that is called when something is added or removed, or the active editor changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Editor listener failed', error);
      }
    }
  }
}

export const EditorManagerContext = createContext<EditorManager | null>(null);

/**
 * Returns the code editor as plugins see it.
 */
export function useEditorManager(): EditorManager;
export function useEditorManager<T>(select: (editor: EditorManager) => T): T;
export function useEditorManager<T>(select?: (editor: EditorManager) => T): EditorManager | T {
  const editor = useContext(EditorManagerContext);
  if (editor === null) {
    throw new Error('Missing EditorManagerContext');
  }

  const subscribe = useCallback((listener: () => void) => editor.subscribe(listener), [editor]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? editor : select(editor)));
}
