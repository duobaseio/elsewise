import { selectAll, toggleComment } from '@codemirror/commands';
import { foldCode, unfoldCode } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { OS } from '@elsewise/components/lib/os';
import { DEFAULT_EDITOR_CONTEXT_MENU, type EditorContextMenu } from '@elsewise/plugin';

const { clipboard, code } = DEFAULT_EDITOR_CONTEXT_MENU;

/**
 * The built-in groups and items in the editor's context menu.
 */
export const DEFAULT_CONTEXT_MENU: EditorContextMenu = {
  [clipboard.id]: [
    { type: 'item', id: clipboard.items.cut, label: 'Cut', shortcut: 'Mod-x', command: cut, shown: selected },
    { type: 'item', id: clipboard.items.copy, label: 'Copy', shortcut: 'Mod-c', command: copy, shown: selected },
    { type: 'item', id: clipboard.items.paste, label: 'Paste', shortcut: 'Mod-v', command: paste },
    { type: 'item', id: clipboard.items.selectAll, label: 'Select all', shortcut: 'Mod-a', command: selectAll },
  ],
  [code.id]: [
    { type: 'item', id: code.items.toggleComment, label: 'Toggle comment', shortcut: 'Mod-/', command: toggleComment },
    {
      type: 'item',
      id: code.items.fold,
      label: 'Fold',
      shortcut: OS === 'mac' ? 'Mod-Alt-[' : 'Ctrl-Shift-[',
      command: foldCode,
    },
    {
      type: 'item',
      id: code.items.unfold,
      label: 'Unfold',
      shortcut: OS === 'mac' ? 'Mod-Alt-]' : 'Ctrl-Shift-]',
      command: unfoldCode,
    },
  ],
};

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
