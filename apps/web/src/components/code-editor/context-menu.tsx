import { selectAll, toggleComment } from '@codemirror/commands';
import { foldCode, unfoldCode } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@elsewise/components/components/context-menu';
import { OS, shortcut } from '@elsewise/components/lib/os';
import { Fragment, type ReactNode, type RefObject, useState } from 'react';

/**
 * The editor's context menu.
 */
export function EditorContextMenu({ view, children }: { view: RefObject<EditorView | null>; children: ReactNode }) {
  // Snapshotted once per opening rather than on every transaction: the menu is closed almost all the time.
  const [groups, setGroups] = useState<readonly (readonly Item[])[]>([]);

  function onOpenChange(open: boolean): void {
    if (open && view.current !== null) {
      const { state } = view.current;
      setGroups(ITEMS.map((group) => group.filter((item) => item.shown?.(state) ?? true)));
    }
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger className="h-full select-auto">{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {groups.map((group, i) => (
          <Fragment key={group[0]?.label}>
            {i > 0 && <ContextMenuSeparator />}
            {group.map((item) => (
              <ContextMenuItem
                key={item.label}
                onClick={() => {
                  if (view.current !== null) {
                    view.current.focus();
                    item.command(view.current);
                  }
                }}
              >
                {item.label}
                <ContextMenuShortcut>{shortcut(item.shortcut)}</ContextMenuShortcut>
              </ContextMenuItem>
            ))}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
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

interface Item {
  label: string;
  shortcut: string;
  command: (view: EditorView) => void;
  shown?: (state: EditorState) => boolean;
}

const ITEMS: readonly (readonly Item[])[] = [
  [
    { label: 'Cut', shortcut: 'Mod-x', command: cut, shown: selected },
    { label: 'Copy', shortcut: 'Mod-c', command: copy, shown: selected },
    { label: 'Paste', shortcut: 'Mod-v', command: paste },
    { label: 'Select all', shortcut: 'Mod-a', command: selectAll },
  ],
  [
    { label: 'Toggle comment', shortcut: 'Mod-/', command: toggleComment },
    { label: 'Fold', shortcut: OS === 'mac' ? 'Mod-Alt-[' : 'Ctrl-Shift-[', command: foldCode },
    { label: 'Unfold', shortcut: OS === 'mac' ? 'Mod-Alt-]' : 'Ctrl-Shift-]', command: unfoldCode },
  ],
];

function selected(state: EditorState): boolean {
  return state.selection.ranges.some((range) => !range.empty);
}

async function cut(view: EditorView): Promise<void> {
  await copy(view);
  view.dispatch(view.state.replaceSelection(''), { scrollIntoView: true, userEvent: 'delete.cut' });
}

function copy(view: EditorView): Promise<void> {
  const state = view.state;
  const text = state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.sliceDoc(range.from, range.to));

  return navigator.clipboard.writeText(text.join(state.lineBreak));
}

async function paste(view: EditorView): Promise<void> {
  const text = await navigator.clipboard.readText();
  view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' });
}
