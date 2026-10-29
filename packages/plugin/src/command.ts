import type { EditorView } from '@codemirror/view';
import type { Terminal } from '@xterm/xterm';
import type { Key, Keys } from './keymap.ts';
import type { Application, Disposable } from './plugin.ts';

/**
 * The ids of the built-in commands.
 */
export const DEFAULT_COMMANDS = {
  application: {
    settings: {
      open: 'elsewise.application.settings.open',
    },
  },
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
      format: 'elsewise.editor.edit.format',
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
    hover: {
      show: 'elsewise.editor.hover.show',
    },
    actions: {
      show: 'elsewise.editor.actions.show',
      applyTopFix: 'elsewise.editor.actions.applyTopFix',
    },
    diagnostics: {
      next: 'elsewise.editor.diagnostics.next',
      previous: 'elsewise.editor.diagnostics.previous',
    },
    diff: {
      unstaged: 'elsewise.editor.diff.unstaged',
      uncommitted: 'elsewise.editor.diff.uncommitted',
      branch: 'elsewise.editor.diff.branch',
      close: 'elsewise.editor.diff.close',
      next: 'elsewise.editor.diff.next',
      previous: 'elsewise.editor.diff.previous',
      unified: 'elsewise.editor.diff.unified',
      split: 'elsewise.editor.diff.split',
    },
    lsp: {
      goToDefinition: 'elsewise.editor.lsp.goToDefinition',
      findUsages: 'elsewise.editor.lsp.findUsages',
      rename: 'elsewise.editor.lsp.rename',
      showSignatureHelp: 'elsewise.editor.lsp.showSignatureHelp',
    },
  },
  terminal: {
    clipboard: {
      copy: 'elsewise.terminal.clipboard.copy',
      paste: 'elsewise.terminal.clipboard.paste',
    },
    search: {
      find: 'elsewise.terminal.search.find',
    },
    selection: {
      selectAll: 'elsewise.terminal.selection.selectAll',
    },
    buffer: {
      clear: 'elsewise.terminal.buffer.clear',
    },
  },
} as const;

/**
 * The default keys of the built-in commands. Commands with no keys have empty lists.
 *
 * See {@link DEFAULT_COMMANDS}.
 */
export const DEFAULT_KEYS: KeysOf<typeof DEFAULT_COMMANDS> = {
  application: {
    settings: {
      open: [{ key: 'Ctrl-Alt-s', mac: 'Mod-,' }],
    },
  },
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
      format: ['Mod-Alt-l'],
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
    hover: {
      show: [{ windows: 'Ctrl-q', mac: 'F1' }, { mac: 'Ctrl-j' }], // Ctrl-q quits application on Linux.
    },
    actions: {
      show: ['Alt-Enter'],
      applyTopFix: ['Shift-Alt-Enter'],
    },
    diagnostics: {
      next: ['F2'],
      previous: ['Shift-F2'],
    },
    diff: {
      unstaged: [],
      uncommitted: [],
      branch: [],
      close: [],
      next: ['F7'],
      previous: ['Shift-F7'],
      unified: [],
      split: [],
    },
    lsp: {
      goToDefinition: ['Mod-b'],
      findUsages: ['Mod-Alt-F7'],
      rename: ['Shift-F6'],
      showSignatureHelp: ['Mod-p'],
    },
  },
  terminal: {
    clipboard: {
      copy: [{ key: 'Ctrl-Shift-c', mac: 'Mod-c' }],
      paste: [{ key: 'Ctrl-Shift-v', mac: 'Mod-v' }],
    },
    search: {
      find: [{ key: 'Ctrl-Shift-f', mac: 'Mod-f' }],
    },
    selection: {
      selectAll: [{ key: 'Ctrl-Shift-a', mac: 'Mod-a' }],
    },
    buffer: {
      clear: [{ mac: 'Mod-k' }],
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
   * Adds `commands`.
   *
   * A command with an already existing id is rejected. Commands that share a key are tried from the last added to the
   * first, until one applies.
   *
   * Returns a disposable that removes the added `commands`.
   */
  add(commands: readonly (ApplicationCommand | EditorCommand | TerminalCommand)[]): Disposable;

  /**
   * Runs the command with `id` against an optional `target`, an editor for an editor command or a terminal for a
   * terminal command. Without `target`, it runs against the active editor or terminal.
   *
   * Does nothing if the command is unknown, has nothing to run against, or is disabled.
   *
   * Returns whether the command ran and applied.
   */
  run(id: string, target?: EditorView | Terminal): boolean;
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
  readonly scope: 'application' | 'editor' | 'terminal';

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
   * Returns whether the command's effect is active, e.g. the source that the file is compared with. Menus show a
   * check beside an active command. Defaults to none, for a command that is neither.
   */
  active?(application: Application): boolean;

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
 * Its keys fire while an editor has focus.
 */
export interface EditorCommand extends Command {
  readonly scope: 'editor';

  /**
   * Returns whether the command can run. Defaults to true.
   *
   * A disabled command is greyed out in menus, and pressing its keys does not run it.
   */
  enabled?(application: Application, view: EditorView): boolean;

  /**
   * Returns whether the command is shown in menus. Defaults to true.
   */
  shown?(application: Application, view: EditorView): boolean;

  /**
   * Returns whether the command's effect is active, e.g. the source that the file is compared with. Menus show a
   * check beside an active command. Defaults to none, for a command that is neither.
   */
  active?(application: Application, view: EditorView): boolean;

  /**
   * Runs the command against `view`.
   *
   * Returns whether the command applied. If it did not, its keys fall through to the next command.
   */
  run(application: Application, view: EditorView): boolean;
}

/**
 * A command that runs in an active terminal.
 *
 * Its keys fire while a terminal has focus, instead of being sent to the shell.
 */
export interface TerminalCommand extends Command {
  readonly scope: 'terminal';

  /**
   * Returns whether the command can run. Defaults to true.
   *
   * A disabled command is greyed out in menus, and pressing its keys does not run it.
   */
  enabled?(application: Application, terminal: Terminal): boolean;

  /**
   * Returns whether the command is shown in menus. Defaults to true.
   */
  shown?(application: Application, terminal: Terminal): boolean;

  /**
   * Returns whether the command's effect is active. Menus show a check beside an active command. Defaults to none, for
   * a command that is neither.
   */
  active?(application: Application, terminal: Terminal): boolean;

  /**
   * Runs the command against `terminal`.
   *
   * Returns whether the command applied. If it did not, its keys fall through to the next command, and then to the
   * shell.
   */
  run(application: Application, terminal: Terminal): boolean;
}
