import type { LSPPlugin } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';
import type { Key, Keys } from './keymap.ts';
import type { Application, Disposable } from './plugin.ts';

/**
 * The ids of the built-in commands.
 */
export const DEFAULT_COMMANDS = {
  editor: {
    clipboard: {
      cut: 'elsewise.editor.clipboard.cut',
      copy: 'elsewise.editor.clipboard.copy',
      paste: 'elsewise.editor.clipboard.paste',
    },
    history: {
      undo: 'elsewise.editor.history.undo',
      redo: 'elsewise.editor.history.redo',
      undoSelection: 'elsewise.editor.history.undoSelection',
      redoSelection: 'elsewise.editor.history.redoSelection',
    },
    search: {
      find: 'elsewise.editor.search.find',
      replace: 'elsewise.editor.search.replace',
      findNext: 'elsewise.editor.search.findNext',
      findPrevious: 'elsewise.editor.search.findPrevious',
      selectNextOccurrence: 'elsewise.editor.search.selectNextOccurrence',
      selectAllOccurrences: 'elsewise.editor.search.selectAllOccurrences',
      goToLine: 'elsewise.editor.search.goToLine',
    },
    fold: {
      fold: 'elsewise.editor.fold.fold',
      unfold: 'elsewise.editor.fold.unfold',
      foldAll: 'elsewise.editor.fold.foldAll',
      unfoldAll: 'elsewise.editor.fold.unfoldAll',
    },
    edit: {
      indent: 'elsewise.editor.edit.indent',
      unindent: 'elsewise.editor.edit.unindent',
      autoIndent: 'elsewise.editor.edit.autoIndent',
      toggleLineComment: 'elsewise.editor.edit.toggleLineComment',
      toggleBlockComment: 'elsewise.editor.edit.toggleBlockComment',
      duplicateLine: 'elsewise.editor.edit.duplicateLine',
      duplicateLineUp: 'elsewise.editor.edit.duplicateLineUp',
      deleteLine: 'elsewise.editor.edit.deleteLine',
      moveLineUp: 'elsewise.editor.edit.moveLineUp',
      moveLineDown: 'elsewise.editor.edit.moveLineDown',
      startNewLine: 'elsewise.editor.edit.startNewLine',
      toggleTabFocusMode: 'elsewise.editor.edit.toggleTabFocusMode',
    },
    caret: {
      addCaretAbove: 'elsewise.editor.caret.addCaretAbove',
      addCaretBelow: 'elsewise.editor.caret.addCaretBelow',
      selectLine: 'elsewise.editor.caret.selectLine',
      extendSelection: 'elsewise.editor.caret.extendSelection',
      moveToMatchingBracket: 'elsewise.editor.caret.moveToMatchingBracket',
      syntaxLeft: 'elsewise.editor.caret.syntaxLeft',
      syntaxRight: 'elsewise.editor.caret.syntaxRight',
      selectSyntaxLeft: 'elsewise.editor.caret.selectSyntaxLeft',
      selectSyntaxRight: 'elsewise.editor.caret.selectSyntaxRight',
    },
    lsp: {
      applyTopFix: 'elsewise.editor.lsp.applyTopFix',
      showContextActions: 'elsewise.editor.lsp.showContextActions',
      goToDefinition: 'elsewise.editor.lsp.goToDefinition',
      format: 'elsewise.editor.lsp.format',
      findUsages: 'elsewise.editor.lsp.findUsages',
      rename: 'elsewise.editor.lsp.rename',
      showSignatureHelp: 'elsewise.editor.lsp.showSignatureHelp',
    },
  },
} as const;

/**
 * The default keys of the built-in commands. Commands with no keys have empty lists.
 *
 * See {@link DEFAULT_COMMANDS}.
 */
export const DEFAULT_KEYS: KeysOf<typeof DEFAULT_COMMANDS> = {
  editor: {
    clipboard: {
      cut: ['Mod-x', { windows: 'Shift-Delete', linux: 'Shift-Delete' }],
      copy: ['Mod-c', { windows: 'Ctrl-Insert', linux: 'Ctrl-Insert' }],
      paste: ['Mod-v', { windows: 'Shift-Insert', linux: 'Shift-Insert' }],
    },
    history: {
      undo: ['Mod-z'],
      redo: ['Mod-Shift-z'],
      undoSelection: ['Mod-u'],
      redoSelection: [{ key: 'Alt-u', mac: 'Mod-Shift-u' }],
    },
    search: {
      find: ['Mod-f'],
      replace: ['Mod-r'],
      findNext: [{ key: 'F3', mac: 'Mod-g' }],
      findPrevious: [{ key: 'Shift-F3', mac: 'Mod-Shift-g' }],
      selectNextOccurrence: [{ key: 'Alt-j', mac: 'Ctrl-g' }],
      // Uppercase since Windows has no Shift-form for keys pressed with Ctrl-Alt.
      selectAllOccurrences: [{ key: 'Ctrl-Alt-J', mac: 'Ctrl-Mod-g' }],
      goToLine: [{ key: 'Ctrl-g', mac: 'Mod-l' }],
    },
    fold: {
      fold: ['Mod--'],
      unfold: ['Mod-='],
      foldAll: ['Mod-Shift--'],
      unfoldAll: ['Mod-Shift-='],
    },
    edit: {
      indent: ['Tab'],
      unindent: ['Shift-Tab'],
      autoIndent: ['Ctrl-Alt-i'],
      toggleLineComment: ['Mod-/'],
      toggleBlockComment: [{ key: 'Ctrl-Shift-/', mac: 'Mod-Alt-/' }],
      duplicateLine: ['Mod-d'],
      duplicateLineUp: [],
      deleteLine: [{ key: 'Ctrl-y', mac: 'Mod-Backspace' }],
      moveLineUp: ['Shift-Alt-ArrowUp'],
      moveLineDown: ['Shift-Alt-ArrowDown'],
      startNewLine: ['Shift-Enter'],
      toggleTabFocusMode: [{ key: 'Ctrl-m', mac: 'Shift-Alt-m' }],
    },
    caret: {
      addCaretAbove: ['Mod-Alt-ArrowUp'],
      addCaretBelow: ['Mod-Alt-ArrowDown'],
      selectLine: [{ key: 'Alt-l', mac: 'Ctrl-l' }],
      extendSelection: [{ key: 'Ctrl-w', mac: 'Alt-ArrowUp' }],
      moveToMatchingBracket: [{ key: 'Ctrl-Shift-m', mac: 'Ctrl-m' }],
      syntaxLeft: [{ key: 'Alt-ArrowLeft', mac: 'Ctrl-ArrowLeft' }],
      syntaxRight: [{ key: 'Alt-ArrowRight', mac: 'Ctrl-ArrowRight' }],
      selectSyntaxLeft: [{ key: 'Shift-Alt-ArrowLeft', mac: 'Shift-Ctrl-ArrowLeft' }],
      selectSyntaxRight: [{ key: 'Shift-Alt-ArrowRight', mac: 'Shift-Ctrl-ArrowRight' }],
    },
    lsp: {
      applyTopFix: ['Shift-Alt-Enter'],
      showContextActions: ['Alt-Enter'],
      goToDefinition: ['Mod-b'],
      format: ['Mod-Alt-l'],
      findUsages: ['Mod-Alt-F7'],
      rename: ['Shift-F6'],
      showSignatureHelp: ['Mod-p'],
    },
  },
};

type KeysOf<T> = { readonly [K in keyof T]: T[K] extends string ? Keys : KeysOf<T[K]> };

/**
 * The commands.
 */
export interface Commands {
  /**
   * The active keymap.
   */
  readonly keymap: ActiveKeymap;

  /**
   * Registers a `listener` that is called with the new keymap when it changes.
   *
   * Returns a disposable that unregisters the `listener`.
   */
  onKeymapChange(listener: (keymap: ActiveKeymap) => void): Disposable;

  /**
   * Adds `commands`.
   *
   * Returns a disposable that removes them.
   */
  add(commands: readonly (ApplicationCommand | EditorCommand)[]): Disposable;

  /**
   * Runs the command with `id` against an optional `target`.
   *
   * Does nothing if the command is unknown, has nothing to run against, or is disabled.
   *
   * Returns whether the command ran and applied.
   */
  run(id: string, target?: EditorView): boolean;
}

/**
 * The active keymap.
 */
export interface ActiveKeymap {
  /**
   * The keymap's display name.
   */
  readonly name: string;

  /**
   * The commands and their keys for the current platform.
   *
   * For example, `{ key: 'Mod-r', windows: 'Ctrl-Alt-r' }` is `Ctrl-Alt-r` on Windows, `Mod-r` elsewhere. `Mod` is
   * never resolved to `Ctrl` or `Cmd`.
   */
  readonly commands: ReadonlyMap<string, readonly Key[]>;
}

/**
 * An action that a user can invoke.
 */
export interface Command {
  /**
   * The surface the command runs in.
   */
  readonly scope: 'application' | 'editor';

  /**
   * The command's id, namespaced by the plugin's, e.g. `io.example.rename`.
   */
  readonly id: string;

  /**
   * The label shown in menus, e.g. `Rename…`.
   */
  readonly label: string;

  /**
   * The default keys in CodeMirror's notation, e.g. `Mod-Shift-k`, that a keymap can override.
   */
  readonly defaultKeys?: Keys;
}

/**
 * A command that runs regardless of what is focused, e.g. opening the settings.
 */
export interface ApplicationCommand extends Command {
  readonly scope: 'application';

  /**
   * Returns whether the command can run. Defaults to true.
   *
   * A disabled command is greyed out in menus, and pressing its keys does not run it.
   */
  enabled?(application: Application): boolean;

  /**
   * Returns whether the command is shown in menus. Defaults to true.
   */
  shown?(application: Application): boolean;

  /**
   * Runs the command.
   *
   * Returns whether the command applied. If it did not, its keys fall through to the next command.
   */
  run(application: Application): boolean;
}

/**
 * A command that runs in an active editor.
 *
 * Its keys fire while an editor has focus. `lsp` is the editor's connection to its language server, or `null` without
 * one.
 */
export interface EditorCommand extends Command {
  readonly scope: 'editor';

  /**
   * Returns whether the command can run. Defaults to true.
   *
   * A disabled command is greyed out in menus, and pressing its keys does not run it.
   */
  enabled?(application: Application, view: EditorView, lsp: LSPPlugin | null): boolean;

  /**
   * Returns whether the command is shown in menus. Defaults to true.
   */
  shown?(application: Application, view: EditorView, lsp: LSPPlugin | null): boolean;

  /**
   * Runs the command against `view`.
   *
   * Returns whether the command applied. If it did not, its keys fall through to the next command.
   */
  run(application: Application, view: EditorView, lsp: LSPPlugin | null): boolean;
}
