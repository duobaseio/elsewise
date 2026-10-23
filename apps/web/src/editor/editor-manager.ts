import { type Extension, Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type {
  Commands,
  ContextMenu,
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
  private addedContextMenus: readonly (readonly Partial<ContextMenu>[])[] = [[DEFAULT_CONTEXT_MENU]];
  private currentContextMenu: ContextMenu = this.merge(this.addedContextMenus.flat());
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
   * The active editor context menu.
   */
  get contextMenu(): ContextMenu {
    return this.currentContextMenu;
  }

  addContextMenus(menus: readonly Partial<ContextMenu>[]): Disposable {
    const added = [...menus];
    this.addedContextMenus = [...this.addedContextMenus, added];
    this.currentContextMenu = this.merge(this.addedContextMenus.flat());
    this.notify();
    return () => {
      this.addedContextMenus = this.addedContextMenus.filter((other) => other !== added);
      this.currentContextMenu = this.merge(this.addedContextMenus.flat());
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

  // Returns `menus` as one: the first submenu or group added with an id wins, and the items are in order of addition.
  private merge(menus: readonly Partial<ContextMenu>[]): ContextMenu {
    const submenus: Record<string, string> = {};
    const groups: Record<string, ContextMenuGroup> = {};
    const items: Record<string, (ContextMenuItem | ContextMenuSubmenuItem)[]> = {};
    for (const menu of menus) {
      for (const [id, submenu] of Object.entries(menu.submenus ?? {})) {
        if (Object.hasOwn(submenus, id)) {
          console.warn(`Context submenu ${id} was already added`);
          continue;
        }

        submenus[id] = submenu;
      }

      for (const [id, group] of Object.entries(menu.groups ?? {})) {
        if (Object.hasOwn(groups, id)) {
          console.warn(`Context menu group ${id} was already added`);
          continue;
        }

        groups[id] = group;
      }

      for (const [id, added] of Object.entries(menu.items ?? {})) {
        if (Object.hasOwn(items, id)) {
          items[id].push(...added);
        } else {
          items[id] = [...added];
        }
      }
    }

    return { submenus, groups, items };
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
