import type { EditorView } from '@codemirror/view';
import { type ContextMenu, DEFAULT_COMMANDS, DEFAULT_EDITOR_CONTEXT_MENU, type EditorCommand } from '@elsewise/plugin';

const { actions, clipboard, navigate, refactor } = DEFAULT_EDITOR_CONTEXT_MENU;
const { lsp } = DEFAULT_COMMANDS.editor;

export const DEFAULT_CONTEXT_MENU: ContextMenu = {
  submenus: {},
  groups: {
    [actions.id]: { order: actions.order },
    [clipboard.id]: { order: clipboard.order },
    [navigate.id]: { order: navigate.order },
    [refactor.id]: { order: refactor.order },
  },
  items: {
    [actions.id]: [{ type: 'item', order: actions.items.show, command: lsp.showContextActions }],
    [clipboard.id]: [
      { type: 'item', order: clipboard.items.cut, command: DEFAULT_COMMANDS.editor.clipboard.cut },
      { type: 'item', order: clipboard.items.copy, command: DEFAULT_COMMANDS.editor.clipboard.copy },
      { type: 'item', order: clipboard.items.paste, command: DEFAULT_COMMANDS.editor.clipboard.paste },
    ],
    [navigate.id]: [
      { type: 'item', order: navigate.items.usages, command: lsp.findUsages },
      { type: 'item', order: navigate.items.definition, command: lsp.goToDefinition },
    ],
    [refactor.id]: [{ type: 'item', order: refactor.items.rename, command: lsp.rename }],
  },
};

export const CUT: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.clipboard.cut,
  label: 'Cut',
  defaultKeys: ['Mod-x', { windows: 'Shift-Delete', linux: 'Shift-Delete' }],
  enabled: (_, view) => !view.state.readOnly,
  shown: (_, view) => view.state.selection.ranges.some((range) => !range.empty),
  run: (_, view) => perform(view, 'cut'),
};

export const COPY: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.clipboard.copy,
  label: 'Copy',
  defaultKeys: ['Mod-c', { windows: 'Ctrl-Insert', linux: 'Ctrl-Insert' }],
  shown: (_, view) => view.state.selection.ranges.some((range) => !range.empty),
  run: (_, view) => perform(view, 'copy'),
};

export const PASTE: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.clipboard.paste,
  label: 'Paste',
  defaultKeys: ['Mod-v', { windows: 'Shift-Insert', linux: 'Shift-Insert' }],
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => perform(view, 'paste'),
};

function perform(view: EditorView, action: 'cut' | 'copy' | 'paste') {
  // Focuses the editor first since the action runs in whatever has focus.
  view.focus();
  if (window.bridge?.window) {
    window.bridge?.window[action]();
  }
}
