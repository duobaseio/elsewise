import type { EditorView } from '@codemirror/view';
import {
  type ContextMenu,
  DEFAULT_COMMANDS,
  DEFAULT_EDITOR_CONTEXT_MENU,
  DEFAULT_KEYS,
  type EditorCommand,
} from '@elsewise/plugin';

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
    [actions.id]: [{ type: 'item', order: actions.items.show, command: DEFAULT_COMMANDS.editor.actions.show }],
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
  defaultKeys: DEFAULT_KEYS.editor.clipboard.cut,
  enabled: (_, view) => !view.state.readOnly,
  shown: (_, view) => view.state.selection.ranges.some((range) => !range.empty),
  run: (_, view) => {
    perform(view, 'cut');
    return true;
  },
};

export const COPY: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.clipboard.copy,
  label: 'Copy',
  defaultKeys: DEFAULT_KEYS.editor.clipboard.copy,
  shown: (_, view) => view.state.selection.ranges.some((range) => !range.empty),
  run: (_, view) => {
    perform(view, 'copy');
    return true;
  },
};

export const PASTE: EditorCommand = {
  scope: 'editor',
  id: DEFAULT_COMMANDS.editor.clipboard.paste,
  label: 'Paste',
  defaultKeys: DEFAULT_KEYS.editor.clipboard.paste,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => {
    perform(view, 'paste');
    return true;
  },
};

function perform(view: EditorView, action: 'cut' | 'copy' | 'paste') {
  // Focuses the editor first since the action runs in whatever has focus.
  view.focus();
  if (window.bridge?.window) {
    window.bridge?.window[action]();
  }
}
