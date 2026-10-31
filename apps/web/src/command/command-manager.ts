import type { EditorView } from '@codemirror/view';
import type { Platform } from '@elsewise/components/lib/platform';
import type {
  ActiveKeymap,
  Application,
  ApplicationCommand,
  CommandCategory,
  Commands,
  Disposable,
  EditorCommand,
  Keymap,
  TerminalCommand,
} from '@elsewise/plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import {
  APPLICATION,
  EDITOR,
  EDITOR_CODE,
  EDITOR_DIFF,
  EDITOR_EDIT,
  EDITOR_NAVIGATE,
  TERMINAL,
} from '@/command/categories';
import { ApplicationKeymap } from '@/command/keymap/application-keymap';
import { EDITOR_APPLY_TOP_FIX, EDITOR_SHOW_ACTIONS } from '@/editor/actions';
import {
  EDITOR_ADD_CARET_ABOVE,
  EDITOR_ADD_CARET_BELOW,
  EDITOR_AUTO_INDENT,
  EDITOR_DELETE_LINE,
  EDITOR_DUPLICATE_LINE,
  EDITOR_DUPLICATE_LINE_UP,
  EDITOR_EXTEND_SELECTION,
  EDITOR_FIND,
  EDITOR_FIND_NEXT,
  EDITOR_FIND_PREVIOUS,
  EDITOR_FOLD,
  EDITOR_FOLD_ALL,
  EDITOR_GO_TO_LINE,
  EDITOR_INDENT,
  EDITOR_MOVE_LINE_DOWN,
  EDITOR_MOVE_LINE_UP,
  EDITOR_MOVE_TO_MATCHING_BRACKET,
  EDITOR_REDO,
  EDITOR_REDO_SELECTION,
  EDITOR_REPLACE,
  EDITOR_SELECT_ALL_OCCURRENCES,
  EDITOR_SELECT_LINE,
  EDITOR_SELECT_NEXT_OCCURRENCE,
  EDITOR_SELECT_SYNTAX_LEFT,
  EDITOR_SELECT_SYNTAX_RIGHT,
  EDITOR_START_NEW_LINE,
  EDITOR_SYNTAX_LEFT,
  EDITOR_SYNTAX_RIGHT,
  EDITOR_TOGGLE_BLOCK_COMMENT,
  EDITOR_TOGGLE_LINE_COMMENT,
  EDITOR_TOGGLE_TAB_FOCUS_MODE,
  EDITOR_UNDO,
  EDITOR_UNDO_SELECTION,
  EDITOR_UNFOLD,
  EDITOR_UNFOLD_ALL,
  EDITOR_UNINDENT,
} from '@/editor/codemirror-commands';
import { EDITOR_COPY, EDITOR_CUT, EDITOR_PASTE } from '@/editor/context-menu/default-context-menu';
import { EDITOR_NEXT_DIAGNOSTIC, EDITOR_PREVIOUS_DIAGNOSTIC } from '@/editor/diagnostics';
import {
  EDITOR_BRANCH_DIFF,
  EDITOR_CLOSE_DIFF,
  EDITOR_NEXT_CHUNK,
  EDITOR_PREVIOUS_CHUNK,
  EDITOR_SPLIT_DIFF,
  EDITOR_UNCOMMITTED_DIFF,
  EDITOR_UNIFIED_DIFF,
  EDITOR_UNSTAGED_DIFF,
} from '@/editor/diff/commands';
import { EDITOR_FORMAT } from '@/editor/format';
import { EDITOR_SHOW_HOVER } from '@/editor/hover';
import { EDITOR_GO_TO_DEFINITION } from '@/editor/lsp/definition';
import { EDITOR_FIND_USAGES } from '@/editor/lsp/references';
import { EDITOR_RENAME } from '@/editor/lsp/rename';
import { EDITOR_SHOW_SIGNATURE_HELP } from '@/editor/lsp/signature-help';
import { OPEN_SETTINGS } from '@/settings/settings';
import { TERMINAL_CLEAR, TERMINAL_COPY, TERMINAL_PASTE, TERMINAL_SELECT_ALL } from '@/terminal/commands';
import { TERMINAL_FIND } from '@/terminal/search/commands';

export const DEFAULT_CATEGORIES: readonly CommandCategory[] = [
  APPLICATION,
  EDITOR,
  EDITOR_CODE,
  EDITOR_DIFF,
  EDITOR_EDIT,
  EDITOR_NAVIGATE,
  TERMINAL,
];

export const DEFAULT_COMMANDS: readonly (ApplicationCommand | EditorCommand | TerminalCommand)[] = [
  // Application
  OPEN_SETTINGS,
  // Editor
  EDITOR_CUT,
  EDITOR_COPY,
  EDITOR_PASTE,
  EDITOR_UNDO,
  EDITOR_REDO,
  EDITOR_UNDO_SELECTION,
  EDITOR_REDO_SELECTION,
  EDITOR_FIND,
  EDITOR_REPLACE,
  EDITOR_FIND_NEXT,
  EDITOR_FIND_PREVIOUS,
  EDITOR_SELECT_NEXT_OCCURRENCE,
  EDITOR_SELECT_ALL_OCCURRENCES,
  EDITOR_GO_TO_LINE,
  EDITOR_FOLD,
  EDITOR_UNFOLD,
  EDITOR_FOLD_ALL,
  EDITOR_UNFOLD_ALL,
  EDITOR_INDENT,
  EDITOR_UNINDENT,
  EDITOR_AUTO_INDENT,
  EDITOR_TOGGLE_LINE_COMMENT,
  EDITOR_TOGGLE_BLOCK_COMMENT,
  EDITOR_DUPLICATE_LINE,
  EDITOR_DUPLICATE_LINE_UP,
  EDITOR_DELETE_LINE,
  EDITOR_MOVE_LINE_UP,
  EDITOR_MOVE_LINE_DOWN,
  EDITOR_START_NEW_LINE,
  EDITOR_TOGGLE_TAB_FOCUS_MODE,
  EDITOR_FORMAT,
  EDITOR_ADD_CARET_ABOVE,
  EDITOR_ADD_CARET_BELOW,
  EDITOR_SELECT_LINE,
  EDITOR_EXTEND_SELECTION,
  EDITOR_MOVE_TO_MATCHING_BRACKET,
  EDITOR_SYNTAX_LEFT,
  EDITOR_SYNTAX_RIGHT,
  EDITOR_SELECT_SYNTAX_LEFT,
  EDITOR_SELECT_SYNTAX_RIGHT,
  EDITOR_SHOW_HOVER,
  EDITOR_SHOW_ACTIONS,
  EDITOR_APPLY_TOP_FIX,
  EDITOR_NEXT_DIAGNOSTIC,
  EDITOR_PREVIOUS_DIAGNOSTIC,
  // Diff
  EDITOR_UNSTAGED_DIFF,
  EDITOR_UNCOMMITTED_DIFF,
  EDITOR_BRANCH_DIFF,
  EDITOR_CLOSE_DIFF,
  EDITOR_NEXT_CHUNK,
  EDITOR_PREVIOUS_CHUNK,
  EDITOR_UNIFIED_DIFF,
  EDITOR_SPLIT_DIFF,
  // LSP
  EDITOR_GO_TO_DEFINITION,
  EDITOR_FIND_USAGES,
  EDITOR_RENAME,
  EDITOR_SHOW_SIGNATURE_HELP,
  // Terminal
  TERMINAL_COPY,
  TERMINAL_PASTE,
  TERMINAL_FIND,
  TERMINAL_SELECT_ALL,
  TERMINAL_CLEAR,
];

/**
 * The commands and their keys.
 */
export class CommandManager implements Commands {
  readonly keymap: ApplicationKeymap;
  private readonly listeners = new Set<() => void>();
  private addedCategories: ReadonlyArray<ReadonlyArray<CommandCategory>> = [];
  private currentCategories: ReadonlyMap<string, CommandCategory> = new Map();
  private addedCommands: ReadonlyArray<ReadonlyArray<ApplicationCommand | EditorCommand | TerminalCommand>> = [];
  private currentCommands: ReadonlyMap<string, ApplicationCommand | EditorCommand | TerminalCommand> = new Map();
  private currentSelected: Keymap;

  constructor(
    private readonly application: Application,
    selected: Keymap,
    platform?: Platform,
  ) {
    this.keymap = new ApplicationKeymap(platform);
    this.currentSelected = selected;
    this.addCategories(DEFAULT_CATEGORIES);
    this.add(DEFAULT_COMMANDS);
  }

  /**
   * The categories by id, in order of addition.
   */
  get categories(): ReadonlyMap<string, CommandCategory> {
    return this.currentCategories;
  }

  /**
   * The commands by id.
   */
  get commands(): ReadonlyMap<string, ApplicationCommand | EditorCommand | TerminalCommand> {
    return this.currentCommands;
  }

  /**
   * The selected keymap, whose entries replace the commands' default keys.
   */
  get selected(): Keymap {
    return this.currentSelected;
  }

  set selected(keymap: Keymap) {
    this.currentSelected = keymap;
    this.update();
  }

  onKeymapChange(listener: (keymap: ActiveKeymap) => void): Disposable {
    let last = this.keymap.commands;
    return this.subscribe(() => {
      if (this.keymap.commands === last) {
        return;
      }

      last = this.keymap.commands;
      try {
        listener(this.keymap);
      } catch (error) {
        console.error('Keymap listener failed', error);
      }
    });
  }

  /**
   * {@inheritDoc}
   */
  addCategories(categories: readonly CommandCategory[]): Disposable {
    const ids = new Set(this.currentCategories.keys());
    const added = categories.filter((category) => {
      if (ids.has(category.id)) {
        console.warn(`Command category ${category.id} already exists`);
        return false;
      }

      if (category.in !== undefined && !ids.has(category.in)) {
        console.warn(`Command category ${category.id} is in unknown category ${category.in}`);
        return false;
      }

      ids.add(category.id);
      return true;
    });
    this.addedCategories = [...this.addedCategories, added];
    this.update();
    return () => {
      // A category is added after the one it is in, so one pass in that order reaches every nested category.
      const removed = new Set(added.map((category) => category.id));
      this.addedCategories = this.addedCategories.map((other) =>
        other.filter((category) => {
          if (category.in !== undefined && removed.has(category.in)) {
            removed.add(category.id);
          }
          return !removed.has(category.id);
        }),
      );
      this.addedCommands = this.addedCommands.map((other) => other.filter((command) => !removed.has(command.category)));
      this.update();
    };
  }

  /**
   * {@inheritDoc}
   */
  add(commands: readonly (ApplicationCommand | EditorCommand | TerminalCommand)[]): Disposable {
    const ids = new Set(this.currentCommands.keys());
    const added = commands.filter((command) => {
      if (ids.has(command.id)) {
        console.warn(`Command ${command.id} already exists`);
        return false;
      }

      if (!this.currentCategories.has(command.category)) {
        console.warn(`Command ${command.id} is in unknown category ${command.category}`);
        return false;
      }

      ids.add(command.id);
      return true;
    });
    this.addedCommands = [...this.addedCommands, added];
    this.update();
    return () => {
      // By command rather than addition, since removing a category may have thinned the addition already.
      this.addedCommands = this.addedCommands.map((other) => other.filter((command) => !added.includes(command)));
      this.update();
    };
  }

  private update() {
    const categories = new Map<string, CommandCategory>();
    for (const category of this.addedCategories.flat()) {
      categories.set(category.id, category);
    }
    this.currentCategories = categories;

    const commands = new Map<string, ApplicationCommand | EditorCommand | TerminalCommand>();
    for (const command of this.addedCommands.flat()) {
      commands.set(command.id, command);
    }

    this.keymap.update(this.currentSelected, commands.values());
    this.currentCommands = commands;
    this.notify();
  }

  run(id: string, target?: EditorView | XTerm): boolean {
    const command = this.currentCommands.get(id);
    if (command === undefined) {
      console.warn(`Unknown command ${id}`);
      return false;
    }

    try {
      if (command.scope === 'editor') {
        if (target !== undefined && isTerminal(target)) {
          console.warn(`Command ${id} runs in an editor, not a terminal`);
          return false;
        }

        const editor = target ?? this.application.editor.active;
        if (editor === null) {
          return false;
        }

        if (command.enabled?.(this.application, editor) === false) {
          return false;
        }

        return command.run(this.application, editor);
      }

      if (command.scope === 'terminal') {
        if (target !== undefined && !isTerminal(target)) {
          console.warn(`Command ${id} runs in a terminal, not an editor`);
          return false;
        }

        const terminal = target ?? this.application.terminal.active;
        if (terminal === null) {
          return false;
        }

        if (command.enabled?.(this.application, terminal) === false) {
          return false;
        }

        return command.run(this.application, terminal);
      }

      if (command.enabled?.(this.application) === false) {
        return false;
      }

      return command.run(this.application);
    } catch (error) {
      console.error(`Command ${command.label} failed`, error);
      return true;
    }
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Commands listener failed', error);
      }
    }
  }
}

export function isTerminal(target: EditorView | XTerm): target is XTerm {
  return 'buffer' in target;
}

export function useCommandManager(): CommandManager;
export function useCommandManager<T>(select: (commands: CommandManager) => T): T;
export function useCommandManager<T>(select?: (commands: CommandManager) => T): CommandManager | T {
  const commands = useApplicationManager().commands;
  const subscribe = useCallback((listener: () => void) => commands.subscribe(listener), [commands]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? commands : select(commands)));
}
