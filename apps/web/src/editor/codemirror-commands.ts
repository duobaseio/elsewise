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
import {
  DEFAULT_COMMAND_GROUPS,
  DEFAULT_COMMANDS,
  DEFAULT_KEYS,
  EDITOR_DOCUMENT,
  type EditorCommand,
} from '@elsewise/plugin';
import { toggleReplaceRow } from '@/editor/search/search-bar-query';

const { caret, edit, fold, history, search } = DEFAULT_COMMANDS.editor;
const keys = DEFAULT_KEYS.editor;
const groups = DEFAULT_COMMAND_GROUPS.editor;

// History
export const EDITOR_UNDO: EditorCommand = {
  scope: 'editor',
  id: history.undo,
  group: groups.edit,
  label: 'Undo',
  defaultKeys: keys.history.undo,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => undo(view),
};

export const EDITOR_REDO: EditorCommand = {
  scope: 'editor',
  id: history.redo,
  group: groups.edit,
  label: 'Redo',
  defaultKeys: keys.history.redo,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => redo(view),
};

export const EDITOR_UNDO_SELECTION: EditorCommand = {
  scope: 'editor',
  id: history.undoSelection,
  group: groups.edit,
  label: 'Undo selection',
  defaultKeys: keys.history.undoSelection,
  run: (_, view) => undoSelection(view),
};

export const EDITOR_REDO_SELECTION: EditorCommand = {
  scope: 'editor',
  id: history.redoSelection,
  group: groups.edit,
  label: 'Redo selection',
  defaultKeys: keys.history.redoSelection,
  run: (_, view) => redoSelection(view),
};

// Search
export const EDITOR_FIND: EditorCommand = {
  scope: 'editor',
  id: search.find,
  group: groups.navigate,
  label: 'Find…',
  defaultKeys: keys.search.find,
  run: (_, view) => {
    openSearchPanel(view);
    view.dispatch({ effects: toggleReplaceRow.of(false) });
    return true;
  },
};

export const EDITOR_REPLACE: EditorCommand = {
  scope: 'editor',
  id: search.replace,
  group: groups.navigate,
  label: 'Replace…',
  defaultKeys: keys.search.replace,
  run: (_, view) => {
    openSearchPanel(view);
    view.dispatch({ effects: toggleReplaceRow.of(true) });
    return true;
  },
};

export const EDITOR_FIND_NEXT: EditorCommand = {
  scope: 'editor',
  id: search.findNext,
  group: groups.navigate,
  label: 'Find next',
  defaultKeys: keys.search.findNext,
  run: (_, view) => findNext(view),
};

export const EDITOR_FIND_PREVIOUS: EditorCommand = {
  scope: 'editor',
  id: search.findPrevious,
  group: groups.navigate,
  label: 'Find previous',
  defaultKeys: keys.search.findPrevious,
  run: (_, view) => findPrevious(view),
};

export const EDITOR_SELECT_NEXT_OCCURRENCE: EditorCommand = {
  scope: 'editor',
  id: search.selectNextOccurrence,
  group: groups.navigate,
  label: 'Select next occurrence',
  defaultKeys: keys.search.selectNextOccurrence,
  run: (_, view) => selectNextOccurrence(view),
};

export const EDITOR_SELECT_ALL_OCCURRENCES: EditorCommand = {
  scope: 'editor',
  id: search.selectAllOccurrences,
  group: groups.navigate,
  label: 'Select all occurrences',
  defaultKeys: keys.search.selectAllOccurrences,
  run: (_, view) => selectSelectionMatches(view),
};

export const EDITOR_GO_TO_LINE: EditorCommand = {
  scope: 'editor',
  id: search.goToLine,
  group: groups.navigate,
  label: 'Go to line…',
  defaultKeys: keys.search.goToLine,
  run: (_, view) => gotoLine(view),
};

// Fold
// Folding always returns true since its default keys would otherwise zoom the window. Does nothing in a split diff view.
export const EDITOR_FOLD: EditorCommand = {
  scope: 'editor',
  id: fold.fold,
  group: groups.edit,
  label: 'Fold',
  defaultKeys: keys.fold.fold,
  run: (_, view) => {
    if (view.state.facet(EDITOR_DOCUMENT)?.layout.type !== 'split') {
      foldCode(view);
    }
    return true;
  },
};

export const EDITOR_UNFOLD: EditorCommand = {
  scope: 'editor',
  id: fold.unfold,
  group: groups.edit,
  label: 'Unfold',
  defaultKeys: keys.fold.unfold,
  run: (_, view) => {
    if (view.state.facet(EDITOR_DOCUMENT)?.layout.type !== 'split') {
      unfoldCode(view);
    }
    return true;
  },
};

export const EDITOR_FOLD_ALL: EditorCommand = {
  scope: 'editor',
  id: fold.foldAll,
  group: groups.edit,
  label: 'Fold all',
  defaultKeys: keys.fold.foldAll,
  run: (_, view) => {
    if (view.state.facet(EDITOR_DOCUMENT)?.layout.type !== 'split') {
      foldAll(view);
    }
    return true;
  },
};

export const EDITOR_UNFOLD_ALL: EditorCommand = {
  scope: 'editor',
  id: fold.unfoldAll,
  group: groups.edit,
  label: 'Unfold all',
  defaultKeys: keys.fold.unfoldAll,
  run: (_, view) => {
    if (view.state.facet(EDITOR_DOCUMENT)?.layout.type !== 'split') {
      unfoldAll(view);
    }
    return true;
  },
};

// Edit
export const EDITOR_INDENT: EditorCommand = {
  scope: 'editor',
  id: edit.indent,
  group: groups.edit,
  label: 'Indent',
  defaultKeys: keys.edit.indent,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => insertTab(view),
};

export const EDITOR_UNINDENT: EditorCommand = {
  scope: 'editor',
  id: edit.unindent,
  group: groups.edit,
  label: 'Unindent',
  defaultKeys: keys.edit.unindent,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => indentLess(view),
};

export const EDITOR_AUTO_INDENT: EditorCommand = {
  scope: 'editor',
  id: edit.autoIndent,
  group: groups.edit,
  label: 'Auto-indent lines',
  defaultKeys: keys.edit.autoIndent,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => indentSelection(view),
};

export const EDITOR_TOGGLE_LINE_COMMENT: EditorCommand = {
  scope: 'editor',
  id: edit.toggleLineComment,
  group: groups.edit,
  label: 'Toggle line comment',
  defaultKeys: keys.edit.toggleLineComment,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => toggleComment(view),
};

export const EDITOR_TOGGLE_BLOCK_COMMENT: EditorCommand = {
  scope: 'editor',
  id: edit.toggleBlockComment,
  group: groups.edit,
  label: 'Toggle block comment',
  defaultKeys: keys.edit.toggleBlockComment,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => toggleBlockComment(view),
};

export const EDITOR_DUPLICATE_LINE: EditorCommand = {
  scope: 'editor',
  id: edit.duplicateLine,
  group: groups.edit,
  label: 'Duplicate line',
  defaultKeys: keys.edit.duplicateLine,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => copyLineDown(view),
};

export const EDITOR_DUPLICATE_LINE_UP: EditorCommand = {
  scope: 'editor',
  id: edit.duplicateLineUp,
  group: groups.edit,
  label: 'Duplicate line up',
  defaultKeys: keys.edit.duplicateLineUp,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => copyLineUp(view),
};

export const EDITOR_DELETE_LINE: EditorCommand = {
  scope: 'editor',
  id: edit.deleteLine,
  group: groups.edit,
  label: 'Delete line',
  defaultKeys: keys.edit.deleteLine,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => deleteLine(view),
};

export const EDITOR_MOVE_LINE_UP: EditorCommand = {
  scope: 'editor',
  id: edit.moveLineUp,
  group: groups.edit,
  label: 'Move line up',
  defaultKeys: keys.edit.moveLineUp,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => moveLineUp(view),
};

export const EDITOR_MOVE_LINE_DOWN: EditorCommand = {
  scope: 'editor',
  id: edit.moveLineDown,
  group: groups.edit,
  label: 'Move line down',
  defaultKeys: keys.edit.moveLineDown,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => moveLineDown(view),
};

export const EDITOR_START_NEW_LINE: EditorCommand = {
  scope: 'editor',
  id: edit.startNewLine,
  group: groups.edit,
  label: 'Start new line',
  defaultKeys: keys.edit.startNewLine,
  enabled: (_, view) => !view.state.readOnly,
  run: (_, view) => insertBlankLine(view),
};

export const EDITOR_TOGGLE_TAB_FOCUS_MODE: EditorCommand = {
  scope: 'editor',
  id: edit.toggleTabFocusMode,
  group: groups.edit,
  label: 'Toggle Tab focus mode',
  defaultKeys: keys.edit.toggleTabFocusMode,
  run: (_, view) => toggleTabFocusMode(view),
};

// Caret
export const EDITOR_ADD_CARET_ABOVE: EditorCommand = {
  scope: 'editor',
  id: caret.addCaretAbove,
  group: groups.navigate,
  label: 'Add caret above',
  defaultKeys: keys.caret.addCaretAbove,
  run: (_, view) => addCursorAbove(view),
};

export const EDITOR_ADD_CARET_BELOW: EditorCommand = {
  scope: 'editor',
  id: caret.addCaretBelow,
  group: groups.navigate,
  label: 'Add caret below',
  defaultKeys: keys.caret.addCaretBelow,
  run: (_, view) => addCursorBelow(view),
};

export const EDITOR_SELECT_LINE: EditorCommand = {
  scope: 'editor',
  id: caret.selectLine,
  group: groups.navigate,
  label: 'Select line',
  defaultKeys: keys.caret.selectLine,
  run: (_, view) => selectLine(view),
};

export const EDITOR_EXTEND_SELECTION: EditorCommand = {
  scope: 'editor',
  id: caret.extendSelection,
  group: groups.navigate,
  label: 'Extend selection',
  defaultKeys: keys.caret.extendSelection,
  // Always returns true since its default key would otherwise close the window on Windows and Linux.
  run: (_, view) => {
    selectParentSyntax(view);
    return true;
  },
};

export const EDITOR_MOVE_TO_MATCHING_BRACKET: EditorCommand = {
  scope: 'editor',
  id: caret.moveToMatchingBracket,
  group: groups.navigate,
  label: 'Move to matching bracket',
  defaultKeys: keys.caret.moveToMatchingBracket,
  run: (_, view) => cursorMatchingBracket(view),
};

export const EDITOR_SYNTAX_LEFT: EditorCommand = {
  scope: 'editor',
  id: caret.syntaxLeft,
  group: groups.navigate,
  label: 'Move left by syntax',
  defaultKeys: keys.caret.syntaxLeft,
  run: (_, view) => cursorSyntaxLeft(view),
};

export const EDITOR_SYNTAX_RIGHT: EditorCommand = {
  scope: 'editor',
  id: caret.syntaxRight,
  group: groups.navigate,
  label: 'Move right by syntax',
  defaultKeys: keys.caret.syntaxRight,
  run: (_, view) => cursorSyntaxRight(view),
};

export const EDITOR_SELECT_SYNTAX_LEFT: EditorCommand = {
  scope: 'editor',
  id: caret.selectSyntaxLeft,
  group: groups.navigate,
  label: 'Select left by syntax',
  defaultKeys: keys.caret.selectSyntaxLeft,
  run: (_, view) => selectSyntaxLeft(view),
};

export const EDITOR_SELECT_SYNTAX_RIGHT: EditorCommand = {
  scope: 'editor',
  id: caret.selectSyntaxRight,
  group: groups.navigate,
  label: 'Select right by syntax',
  defaultKeys: keys.caret.selectSyntaxRight,
  run: (_, view) => selectSyntaxRight(view),
};
