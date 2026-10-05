import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@elsewise/components/components/context-menu';
import { shortcut } from '@elsewise/components/lib/os';
import type { EditorContextMenu, EditorContextMenuItem, EditorContextSubmenu } from '@elsewise/plugin';
import { Fragment, type ReactNode, type RefObject, useState } from 'react';
import { useEditorAdditions } from '@/plugins/editor';

/**
 * The editor's context menu.
 */
export function CodeEditorContextMenu({ view, children }: { view: RefObject<EditorView | null>; children: ReactNode }) {
  // Snapshotted once per opening rather than on every transaction: the menu is closed almost all the time.
  const [menu, setMenu] = useState<EditorContextMenu>({});
  const additions = useEditorAdditions();

  function onOpenChange(open: boolean): void {
    if (open && view.current !== null) {
      setMenu(shown(additions.contextMenuItems, view.current.state));
    }
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger className="h-full select-auto">{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <Entries menu={menu} view={view} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function shown(menu: EditorContextMenu, state: EditorState): EditorContextMenu {
  const groups = new Map<string, (EditorContextMenuItem | EditorContextSubmenu)[]>();
  for (const [group, entries] of Object.entries(menu)) {
    const kept = [];
    for (const entry of entries) {
      if (entry.type === 'submenu') {
        const items = shown(entry.items, state);
        if (Object.keys(items).length > 0) {
          kept.push({ ...entry, items });
        }
        continue;
      }

      try {
        if (entry.shown?.(state) ?? true) {
          kept.push(entry);
        }
      } catch (error) {
        console.error(`Context menu item ${entry.label} failed`, error);
      }
    }

    if (kept.length > 0) {
      groups.set(group, kept);
    }
  }

  return Object.fromEntries(groups);
}

function Entries({ menu, view }: { menu: EditorContextMenu; view: RefObject<EditorView | null> }) {
  return Object.entries(menu)
    .toSorted(([a], [b]) => compare(a, b))
    .map(([group, entries], i) => (
      <Fragment key={group}>
        {i > 0 && <ContextMenuSeparator />}
        {entries
          .toSorted((a, b) => compare(a.id, b.id) || compare(a.label, b.label))
          .map((entry, j) =>
            entry.type === 'submenu' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: keyed by position since plugin ids may repeat.
              <ContextMenuSub key={j}>
                <ContextMenuSubTrigger>{entry.label}</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <Entries menu={entry.items} view={view} />
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : (
              <ContextMenuItem
                // biome-ignore lint/suspicious/noArrayIndexKey: keyed by position since plugin ids may repeat.
                key={j}
                onClick={() => {
                  if (view.current !== null) {
                    view.current.focus();
                    try {
                      entry.command(view.current);
                    } catch (error) {
                      console.error(`Context menu item ${entry.label} failed`, error);
                    }
                  }
                }}
              >
                {entry.label}
                {entry.shortcut !== undefined && <ContextMenuShortcut>{shortcut(entry.shortcut)}</ContextMenuShortcut>}
              </ContextMenuItem>
            ),
          )}
      </Fragment>
    ));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Moves the caret to where the user right-clicked, unless the click is inside the selection.
 *
 * This is necessary to show correct items in context menu.
 */
export const rightClickContextMenu = EditorView.domEventHandlers({
  contextmenu(event, view) {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (
      position === null ||
      view.state.selection.ranges.some((range) => range.from <= position && position <= range.to)
    ) {
      return false;
    }

    view.dispatch({ selection: { anchor: position }, userEvent: 'select.pointer' });
    return false;
  },
});
