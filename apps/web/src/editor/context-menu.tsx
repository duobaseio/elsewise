import { EditorView } from '@codemirror/view';
import type { ReactNode, RefObject } from 'react';
import { CommandContextMenu } from '@/command/context-menu';
import { useEditorManager } from '@/editor/editor-manager';

/**
 * The editor's context menu.
 */
export function EditorContextMenu({ view, children }: { view: RefObject<EditorView | null>; children: ReactNode }) {
  const menu = useEditorManager((editor) => editor.contextMenu);
  return (
    <CommandContextMenu menu={menu} view={view} onClosed={() => view.current?.focus()} className="h-full select-auto">
      {children}
    </CommandContextMenu>
  );
}

/**
 * Moves the caret to where the user right-clicked, unless the click is inside the selection.
 *
 * Necessary to show correct items in context menu.
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
