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
import { Fragment, type ReactNode, type RefObject, useRef, useState } from 'react';
import { useEditorAdditions } from '@/plugins/editor';

/**
 * The editor's context menu.
 */
export function CodeEditorContextMenu({ view, children }: { view: RefObject<EditorView | null>; children: ReactNode }) {
  // Snapshotted once per opening rather than on every transaction: the menu is closed almost all the time.
  const [menu, setMenu] = useState<EditorContextMenu>({});
  const additions = useEditorAdditions();
  const clicked = useRef<EditorContextMenuItem | null>(null);

  function onOpenChange(open: boolean): void {
    if (open && view.current !== null) {
      setMenu(shown(additions.contextMenuItems, view.current));
    }
  }

  // Runs the clicked item once the menu has closed and given the editor its focus back. The returning focus would
  // otherwise undo a selection that the item changes later, e.g. on a language server's answer.
  function onOpenChangeComplete(open: boolean): void {
    const entry = clicked.current;
    clicked.current = null;
    if (open || entry === null || view.current === null) {
      return;
    }

    view.current.focus();
    try {
      entry.command(view.current);
    } catch (error) {
      console.error(`Context menu item ${entry.label} failed`, error);
    }
  }

  return (
    <ContextMenu onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <ContextMenuTrigger className="h-full select-auto">{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <Entries menu={menu} onClick={(entry) => (clicked.current = entry)} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function shown(menu: EditorContextMenu, view: EditorView): EditorContextMenu {
  const groups = new Map<string, (EditorContextMenuItem | EditorContextSubmenu)[]>();
  for (const [group, entries] of Object.entries(menu)) {
    const kept = [];
    for (const entry of entries) {
      if (entry.type === 'submenu') {
        const items = shown(entry.items, view);
        if (Object.keys(items).length > 0) {
          kept.push({ ...entry, items });
        }
        continue;
      }

      try {
        if (entry.shown?.(view) ?? true) {
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

function Entries({ menu, onClick }: { menu: EditorContextMenu; onClick: (entry: EditorContextMenuItem) => void }) {
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
                  <Entries menu={entry.items} onClick={onClick} />
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : (
              <ContextMenuItem
                // biome-ignore lint/suspicious/noArrayIndexKey: keyed by position since plugin ids may repeat.
                key={j}
                onClick={() => onClick(entry)}
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
