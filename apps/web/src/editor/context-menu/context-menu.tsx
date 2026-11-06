import { EditorView } from '@codemirror/view';
import type { RefObject } from 'react';
import { CommandContextMenu, type CommandContextMenuProps } from '@/command/context-menu/context-menu';
import { useEditorManager } from '@/editor/editor-manager';

/**
 * The editor's context menu.
 */
export function EditorContextMenu({
  view,
  render,
}: {
  view: RefObject<EditorView | null>;
  render: CommandContextMenuProps['render'];
}) {
  const menu = useEditorManager((editor) => editor.contextMenu);
  return (
    <CommandContextMenu
      menu={menu}
      target={view}
      onClosed={() => view.current?.focus()}
      render={render}
      className="select-auto"
    />
  );
}

/**
 * Moves the caret to where the user right-clicked, unless the click is inside the selection.
 *
 * Necessary to show correct items in context menu.
 */
export const RIGHT_CLICK_CONTEXT_MENU = EditorView.domEventHandlers({
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
