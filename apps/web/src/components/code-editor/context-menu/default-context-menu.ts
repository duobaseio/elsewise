import { LSPPlugin } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';
import { DEFAULT_EDITOR_CONTEXT_MENU, type EditorContextMenu } from '@elsewise/plugin';
import { tags } from '@lezer/highlight';
import type { ServerCapabilities } from 'vscode-languageserver-protocol';
import { symbol } from '@/components/code-editor/symbol';
import { SHOW_ACTIONS, showActions } from '@/language-servers/actions';
import { JUMP_TO_DEFINITION, jumpToDefinition } from '@/language-servers/definition';
import { findUsages, SHOW_USAGES } from '@/language-servers/references';
import { RENAME, rename } from '@/language-servers/rename';

const { actions, clipboard, navigate, refactor } = DEFAULT_EDITOR_CONTEXT_MENU;

/**
 * The built-in groups and items in the editor's context menu.
 */
export const DEFAULT_CONTEXT_MENU: EditorContextMenu = {
  [actions.id]: [
    {
      type: 'item',
      id: actions.items.show,
      label: 'Show context actions',
      shortcut: SHOW_ACTIONS,
      command: showActions,
      shown: (view) => supports(view, 'codeActionProvider'),
    },
  ],
  [clipboard.id]: [
    { type: 'item', id: clipboard.items.cut, label: 'Cut', shortcut: 'Mod-x', command: cut, shown: selected },
    { type: 'item', id: clipboard.items.copy, label: 'Copy', shortcut: 'Mod-c', command: copy, shown: selected },
    { type: 'item', id: clipboard.items.paste, label: 'Paste', shortcut: 'Mod-v', command: paste },
  ],
  [navigate.id]: [
    {
      type: 'item',
      id: navigate.items.usages,
      label: 'Find usages',
      shortcut: SHOW_USAGES,
      command: findUsages,
      shown: (view) => navigable(view, 'referencesProvider'),
    },
    {
      type: 'item',
      id: navigate.items.definition,
      label: 'Go to definition',
      shortcut: JUMP_TO_DEFINITION,
      command: jumpToDefinition,
      shown: (view) => navigable(view, 'definitionProvider'),
    },
  ],
  [refactor.id]: [
    {
      type: 'item',
      id: refactor.items.rename,
      label: 'Rename…',
      shortcut: RENAME,
      command: rename,
      shown: (view) => {
        const { state } = view;
        const { from, to } = state.selection.main;
        const word = symbol(view.state);
        return (
          supports(view, 'renameProvider') &&
          !state.readOnly &&
          state.selection.ranges.length === 1 &&
          word !== null &&
          from >= word.from &&
          to <= word.to &&
          !word.is(tags.keyword) &&
          !word.is(tags.comment) &&
          !word.is(tags.string)
        );
      },
    },
  ],
};

function selected(view: EditorView): boolean {
  return view.state.selection.ranges.some((range) => !range.empty);
}

function supports(view: EditorView, capability: keyof ServerCapabilities): boolean {
  return Boolean(LSPPlugin.get(view)?.client.serverCapabilities?.[capability]);
}

// Whether the server can follow the word at the cursor with `capability`. A comment can't be followed, and neither can
// a keyword other than `self` or `this`. A string can, e.g. an import's path.
function navigable(view: EditorView, capability: keyof ServerCapabilities): boolean {
  const word = symbol(view.state);
  return (
    supports(view, capability) &&
    word !== null &&
    !word.is(tags.comment) &&
    (!word.is(tags.keyword) || word.is(tags.self))
  );
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
