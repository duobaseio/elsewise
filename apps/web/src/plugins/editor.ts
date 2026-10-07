import type { LanguageDescription } from '@codemirror/language';
import { languages as DEFAULT_LANGUAGES } from '@codemirror/language-data';
import type { Extension } from '@codemirror/state';
import type {
  Disposable,
  Editor,
  EditorContextMenu,
  EditorContextMenuItem,
  EditorContextSubmenu,
  EditorDocument,
  LanguageServer,
} from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { DEFAULT_CONTEXT_MENU } from '@/components/code-editor/context-menu/default-context-menu';

/**
 * What plugins have added to the editor.
 */
export class EditorAdditions implements Editor {
  private readonly listeners = new Set<() => void>();
  private addedExtensions: readonly (readonly (Extension | ((document: EditorDocument) => Extension))[])[] = [];
  private currentExtensions: readonly (Extension | ((document: EditorDocument) => Extension))[] = [];
  private addedLanguages: readonly (readonly LanguageDescription[])[] = [DEFAULT_LANGUAGES];
  private currentLanguages: readonly LanguageDescription[] = DEFAULT_LANGUAGES;
  private addedLanguageServers: readonly (readonly LanguageServer[])[] = [];
  private currentLanguageServers: readonly LanguageServer[] = [];
  private addedContextMenuItems: readonly EditorContextMenu[] = [DEFAULT_CONTEXT_MENU];
  private currentContextMenuItems: EditorContextMenu = DEFAULT_CONTEXT_MENU;

  /**
   * The added extensions.
   */
  public get extensions(): readonly (Extension | ((document: EditorDocument) => Extension))[] {
    return this.currentExtensions;
  }

  public addExtensions(extensions: readonly (Extension | ((document: EditorDocument) => Extension))[]): Disposable {
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
   * The added languages, sorted by most recently added, then the built-in ones.
   */
  public get languages(): readonly LanguageDescription[] {
    return this.currentLanguages;
  }

  public addLanguages(languages: readonly LanguageDescription[]): Disposable {
    const added = [...languages];
    this.addedLanguages = [added, ...this.addedLanguages];
    this.currentLanguages = this.addedLanguages.flat();
    this.notify();
    return () => {
      this.addedLanguages = this.addedLanguages.filter((other) => other !== added);
      this.currentLanguages = this.addedLanguages.flat();
      this.notify();
    };
  }

  /**
   * The added language servers, sorted by most recently added.
   */
  public get languageServers(): readonly LanguageServer[] {
    return this.currentLanguageServers;
  }

  public addLanguageServers(servers: readonly LanguageServer[]): Disposable {
    const added = [...servers];
    this.addedLanguageServers = [added, ...this.addedLanguageServers];
    this.currentLanguageServers = this.addedLanguageServers.flat();
    this.notify();
    return () => {
      this.addedLanguageServers = this.addedLanguageServers.filter((other) => other !== added);
      this.currentLanguageServers = this.addedLanguageServers.flat();
      this.notify();
    };
  }

  /**
   * The built-in and the added context menu items, keyed by the id of the group that they are shown in.
   */
  public get contextMenuItems(): EditorContextMenu {
    return this.currentContextMenuItems;
  }

  public addContextMenuItems(items: EditorContextMenu): Disposable {
    const added = { ...items };
    const merged = this.merge([...this.addedContextMenuItems, added]);
    this.addedContextMenuItems = [...this.addedContextMenuItems, added];
    this.currentContextMenuItems = merged;
    this.notify();
    return () => {
      // Merges what is left again rather than taking the items back out of the submenus they were merged into.
      this.addedContextMenuItems = this.addedContextMenuItems.filter((other) => other !== added);
      this.currentContextMenuItems = this.merge(this.addedContextMenuItems);
      this.notify();
    };
  }

  // Returns `menus` as one menu, in which the submenus with the same id in a group are one submenu.
  private merge(menus: readonly EditorContextMenu[]): EditorContextMenu {
    const groups = new Map<string, { items: EditorContextMenuItem[]; submenus: Map<string, EditorContextSubmenu[]> }>();
    for (const [group, entries] of menus.flatMap((menu) => Object.entries(menu))) {
      let merged = groups.get(group);
      if (merged === undefined) {
        merged = { items: [], submenus: new Map() };
        groups.set(group, merged);
      }

      for (const entry of entries) {
        if (entry.type === 'item') {
          merged.items.push(entry);
        } else {
          merged.submenus.set(entry.id, [...(merged.submenus.get(entry.id) ?? []), entry]);
        }
      }
    }

    return Object.fromEntries(
      [...groups].map(([group, { items, submenus }]) => [
        group,
        [
          ...items,
          ...[...submenus.values()].map(
            (same): EditorContextSubmenu => ({
              type: 'submenu',
              id: same[0].id,
              label: same[0].label,
              items: this.merge(same.map((submenu) => submenu.items)),
            }),
          ),
        ],
      ]),
    );
  }

  /**
   * Registers a `listener` that is called when something is added or removed.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  public subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

/**
 * What plugins have added to the editor.
 *
 * Defaults to nothing.
 */
export const EditorAdditionsContext = createContext(new EditorAdditions());

/**
 * Returns what plugins have added to the editor.
 */
export function useEditorAdditions(): EditorAdditions;
export function useEditorAdditions<T>(select: (additions: EditorAdditions) => T): T;
export function useEditorAdditions<T>(select?: (additions: EditorAdditions) => T): EditorAdditions | T {
  const additions = useContext(EditorAdditionsContext);
  const subscribe = useCallback((listener: () => void) => additions.subscribe(listener), [additions]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? additions : select(additions)));
}
