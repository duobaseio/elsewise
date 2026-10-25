import type { EditorView } from '@codemirror/view';
import {
  type ContextMenuGroup,
  DEFAULT_COMMANDS,
  DEFAULT_EDITOR_CONTEXT_MENU,
  DEFAULT_KEYS,
  type EditorCommand,
} from '@elsewise/plugin';

const { actions, clipboard, navigate, diff, refactor } = DEFAULT_EDITOR_CONTEXT_MENU;
const { compare } = diff.items;
const { lsp } = DEFAULT_COMMANDS.editor;

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuGroup[] = [
  {
    id: actions.id,
    order: actions.order,
    items: [{ order: actions.items.show, command: DEFAULT_COMMANDS.editor.actions.show }],
  },
  {
    id: clipboard.id,
    order: clipboard.order,
    items: [
      { order: clipboard.items.cut, command: DEFAULT_COMMANDS.editor.clipboard.cut },
      { order: clipboard.items.copy, command: DEFAULT_COMMANDS.editor.clipboard.copy },
      { order: clipboard.items.paste, command: DEFAULT_COMMANDS.editor.clipboard.paste },
    ],
  },
  {
    id: navigate.id,
    order: navigate.order,
    items: [
      { order: navigate.items.usages, command: lsp.findUsages },
      { order: navigate.items.definition, command: lsp.goToDefinition },
    ],
  },
  { id: diff.id, order: diff.order, items: [{ order: compare.order, label: 'Compare with…', submenu: compare.id }] },
  {
    id: compare.groups.changes.id,
    order: compare.groups.changes.order,
    in: compare.id,
    items: [
      { order: compare.groups.changes.items.unstaged, command: DEFAULT_COMMANDS.editor.diff.unstaged },
      { order: compare.groups.changes.items.uncommitted, command: DEFAULT_COMMANDS.editor.diff.uncommitted },
      { order: compare.groups.changes.items.branch, command: DEFAULT_COMMANDS.editor.diff.branch },
    ],
  },
  {
    id: compare.groups.none.id,
    order: compare.groups.none.order,
    in: compare.id,
    items: [{ order: compare.groups.none.items.none, label: 'None', command: DEFAULT_COMMANDS.editor.diff.close }],
  },
  { id: refactor.id, order: refactor.order, items: [{ order: refactor.items.rename, command: lsp.rename }] },
];

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
