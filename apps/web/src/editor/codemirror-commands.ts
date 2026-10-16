import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  cursorSyntaxLeft,
  cursorSyntaxRight,
  deleteLine,
  indentLess,
  indentSelection,
  insertBlankLine,
  insertTab,
  moveLineDown,
  moveLineUp,
  redo,
  redoSelection,
  selectLine,
  selectParentSyntax,
  selectSyntaxLeft,
  selectSyntaxRight,
  toggleBlockComment,
  toggleComment,
  toggleTabFocusMode,
  undo,
  undoSelection,
} from '@codemirror/commands';
import { foldAll, foldCode, unfoldAll, unfoldCode } from '@codemirror/language';
import {
  findNext,
  findPrevious,
  gotoLine,
  openSearchPanel,
  selectNextOccurrence,
  selectSelectionMatches,
} from '@codemirror/search';
import { DEFAULT_COMMANDS, DEFAULT_KEYS, type EditorCommand } from '@elsewise/plugin';
import { toggleReplaceRow } from '@/editor/search/search-bar-query';

const { caret, edit, fold, history, search } = DEFAULT_COMMANDS.editor;
const keys = DEFAULT_KEYS.editor;

export const HISTORY: readonly EditorCommand[] = [
  {
    scope: 'editor',
    id: history.undo,
    label: 'Undo',
    defaultKeys: keys.history.undo,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => undo(view),
  },
  {
    scope: 'editor',
    id: history.redo,
    label: 'Redo',
    defaultKeys: keys.history.redo,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => redo(view),
  },
  {
    scope: 'editor',
    id: history.undoSelection,
    label: 'Undo selection',
    defaultKeys: keys.history.undoSelection,
    run: (_, view) => undoSelection(view),
  },
  {
    scope: 'editor',
    id: history.redoSelection,
    label: 'Redo selection',
    defaultKeys: keys.history.redoSelection,
    run: (_, view) => redoSelection(view),
  },
];

export const SEARCH: readonly EditorCommand[] = [
  {
    scope: 'editor',
    id: search.find,
    label: 'Find…',
    defaultKeys: keys.search.find,
    run: (_, view) => {
      openSearchPanel(view);
      view.dispatch({ effects: toggleReplaceRow.of(false) });
      return true;
    },
  },
  {
    scope: 'editor',
    id: search.replace,
    label: 'Replace…',
    defaultKeys: keys.search.replace,
    run: (_, view) => {
      openSearchPanel(view);
      view.dispatch({ effects: toggleReplaceRow.of(true) });
      return true;
    },
  },
  {
    scope: 'editor',
    id: search.findNext,
    label: 'Find next',
    defaultKeys: keys.search.findNext,
    run: (_, view) => findNext(view),
  },
  {
    scope: 'editor',
    id: search.findPrevious,
    label: 'Find previous',
    defaultKeys: keys.search.findPrevious,
    run: (_, view) => findPrevious(view),
  },
  {
    scope: 'editor',
    id: search.selectNextOccurrence,
    label: 'Select next occurrence',
    defaultKeys: keys.search.selectNextOccurrence,
    run: (_, view) => selectNextOccurrence(view),
  },
  {
    scope: 'editor',
    id: search.selectAllOccurrences,
    label: 'Select all occurrences',
    defaultKeys: keys.search.selectAllOccurrences,
    run: (_, view) => selectSelectionMatches(view),
  },
  {
    scope: 'editor',
    id: search.goToLine,
    label: 'Go to line…',
    defaultKeys: keys.search.goToLine,
    run: (_, view) => gotoLine(view),
  },
];

// Folding always returns true since its default keys would otherwise zoom the window.
export const FOLD: readonly EditorCommand[] = [
  {
    scope: 'editor',
    id: fold.fold,
    label: 'Fold',
    defaultKeys: keys.fold.fold,
    run: (_, view) => {
      foldCode(view);
      return true;
    },
  },
  {
    scope: 'editor',
    id: fold.unfold,
    label: 'Unfold',
    defaultKeys: keys.fold.unfold,
    run: (_, view) => {
      unfoldCode(view);
      return true;
    },
  },
  {
    scope: 'editor',
    id: fold.foldAll,
    label: 'Fold all',
    defaultKeys: keys.fold.foldAll,
    run: (_, view) => {
      foldAll(view);
      return true;
    },
  },
  {
    scope: 'editor',
    id: fold.unfoldAll,
    label: 'Unfold all',
    defaultKeys: keys.fold.unfoldAll,
    run: (_, view) => {
      unfoldAll(view);
      return true;
    },
  },
];

export const EDIT: readonly EditorCommand[] = [
  {
    scope: 'editor',
    id: edit.indent,
    label: 'Indent',
    defaultKeys: keys.edit.indent,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => insertTab(view),
  },
  {
    scope: 'editor',
    id: edit.unindent,
    label: 'Unindent',
    defaultKeys: keys.edit.unindent,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => indentLess(view),
  },
  {
    scope: 'editor',
    id: edit.autoIndent,
    label: 'Auto-indent lines',
    defaultKeys: keys.edit.autoIndent,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => indentSelection(view),
  },
  {
    scope: 'editor',
    id: edit.toggleLineComment,
    label: 'Toggle line comment',
    defaultKeys: keys.edit.toggleLineComment,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => toggleComment(view),
  },
  {
    scope: 'editor',
    id: edit.toggleBlockComment,
    label: 'Toggle block comment',
    defaultKeys: keys.edit.toggleBlockComment,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => toggleBlockComment(view),
  },
  {
    scope: 'editor',
    id: edit.duplicateLine,
    label: 'Duplicate line',
    defaultKeys: keys.edit.duplicateLine,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => copyLineDown(view),
  },
  {
    scope: 'editor',
    id: edit.duplicateLineUp,
    label: 'Duplicate line up',
    defaultKeys: keys.edit.duplicateLineUp,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => copyLineUp(view),
  },
  {
    scope: 'editor',
    id: edit.deleteLine,
    label: 'Delete line',
    defaultKeys: keys.edit.deleteLine,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => deleteLine(view),
  },
  {
    scope: 'editor',
    id: edit.moveLineUp,
    label: 'Move line up',
    defaultKeys: keys.edit.moveLineUp,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => moveLineUp(view),
  },
  {
    scope: 'editor',
    id: edit.moveLineDown,
    label: 'Move line down',
    defaultKeys: keys.edit.moveLineDown,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => moveLineDown(view),
  },
  {
    scope: 'editor',
    id: edit.startNewLine,
    label: 'Start new line',
    defaultKeys: keys.edit.startNewLine,
    enabled: (_, view) => !view.state.readOnly,
    run: (_, view) => insertBlankLine(view),
  },
  {
    scope: 'editor',
    id: edit.toggleTabFocusMode,
    label: 'Toggle Tab focus mode',
    defaultKeys: keys.edit.toggleTabFocusMode,
    run: (_, view) => toggleTabFocusMode(view),
  },
];

export const CARET: readonly EditorCommand[] = [
  {
    scope: 'editor',
    id: caret.addCaretAbove,
    label: 'Add caret above',
    defaultKeys: keys.caret.addCaretAbove,
    run: (_, view) => addCursorAbove(view),
  },
  {
    scope: 'editor',
    id: caret.addCaretBelow,
    label: 'Add caret below',
    defaultKeys: keys.caret.addCaretBelow,
    run: (_, view) => addCursorBelow(view),
  },
  {
    scope: 'editor',
    id: caret.selectLine,
    label: 'Select line',
    defaultKeys: keys.caret.selectLine,
    run: (_, view) => selectLine(view),
  },
  {
    scope: 'editor',
    id: caret.extendSelection,
    label: 'Extend selection',
    defaultKeys: keys.caret.extendSelection,
    // Always returns true since its default key would otherwise close the window on Windows and Linux.
    run: (_, view) => {
      selectParentSyntax(view);
      return true;
    },
  },
  {
    scope: 'editor',
    id: caret.moveToMatchingBracket,
    label: 'Move to matching bracket',
    defaultKeys: keys.caret.moveToMatchingBracket,
    run: (_, view) => cursorMatchingBracket(view),
  },
  {
    scope: 'editor',
    id: caret.syntaxLeft,
    label: 'Move left by syntax',
    defaultKeys: keys.caret.syntaxLeft,
    run: (_, view) => cursorSyntaxLeft(view),
  },
  {
    scope: 'editor',
    id: caret.syntaxRight,
    label: 'Move right by syntax',
    defaultKeys: keys.caret.syntaxRight,
    run: (_, view) => cursorSyntaxRight(view),
  },
  {
    scope: 'editor',
    id: caret.selectSyntaxLeft,
    label: 'Select left by syntax',
    defaultKeys: keys.caret.selectSyntaxLeft,
    run: (_, view) => selectSyntaxLeft(view),
  },
  {
    scope: 'editor',
    id: caret.selectSyntaxRight,
    label: 'Select right by syntax',
    defaultKeys: keys.caret.selectSyntaxRight,
    run: (_, view) => selectSyntaxRight(view),
  },
];
