import { EditorView } from '@codemirror/view';
import { type ContextMenu, DEFAULT_COMMANDS, DEFAULT_EDITOR_CONTEXT_MENU } from '@elsewise/plugin';
import type { ReactNode, RefObject } from 'react';
import { CommandContextMenu } from '@/command/context-menu';
import { useEditorManager } from '@/editor/editor-manager';

const { actions, navigate, refactor } = DEFAULT_EDITOR_CONTEXT_MENU;
const { lsp } = DEFAULT_COMMANDS.editor;

/**
 * The built-in groups and items in the editor's context menu.
 */
// TODO: Add the clipboard group back once cut, copy and paste are commands that keep CodeMirror's clipboard handling.
export const DEFAULT_CONTEXT_MENU: ContextMenu = {
  submenus: {},
  groups: {
    [actions.id]: { order: actions.order },
    [navigate.id]: { order: navigate.order },
    [refactor.id]: { order: refactor.order },
  },
  items: {
    [actions.id]: [{ type: 'item', order: actions.items.show, command: lsp.showContextActions }],
    [navigate.id]: [
      { type: 'item', order: navigate.items.usages, command: lsp.findUsages },
      { type: 'item', order: navigate.items.definition, command: lsp.goToDefinition },
    ],
    [refactor.id]: [{ type: 'item', order: refactor.items.rename, command: lsp.rename }],
  },
};

/**
 * The editor's context menu.
 */
export function CodeEditorContextMenu({ view, children }: { view: RefObject<EditorView | null>; children: ReactNode }) {
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
