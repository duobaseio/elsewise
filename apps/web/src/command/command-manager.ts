import type { EditorView } from '@codemirror/view';
import type { Platform } from '@elsewise/components/lib/platform';
import type {
  ActiveKeymap,
  Application,
  ApplicationCommand,
  Commands,
  Disposable,
  EditorCommand,
  Keymap,
} from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { ApplicationKeymap } from '@/command/application-keymap';
import { ELSEWISE } from '@/command/keymap';
import { APPLY_TOP_FIX, SHOW_ACTIONS } from '@/editor/actions';
import {
  ADD_CARET_ABOVE,
  ADD_CARET_BELOW,
  AUTO_INDENT,
  DELETE_LINE,
  DUPLICATE_LINE,
  DUPLICATE_LINE_UP,
  EXTEND_SELECTION,
  FIND,
  FIND_NEXT,
  FIND_PREVIOUS,
  FOLD,
  FOLD_ALL,
  GO_TO_LINE,
  INDENT,
  MOVE_LINE_DOWN,
  MOVE_LINE_UP,
  MOVE_TO_MATCHING_BRACKET,
  REDO,
  REDO_SELECTION,
  REPLACE,
  SELECT_ALL_OCCURRENCES,
  SELECT_LINE,
  SELECT_NEXT_OCCURRENCE,
  SELECT_SYNTAX_LEFT,
  SELECT_SYNTAX_RIGHT,
  START_NEW_LINE,
  SYNTAX_LEFT,
  SYNTAX_RIGHT,
  TOGGLE_BLOCK_COMMENT,
  TOGGLE_LINE_COMMENT,
  TOGGLE_TAB_FOCUS_MODE,
  UNDO,
  UNDO_SELECTION,
  UNFOLD,
  UNFOLD_ALL,
  UNINDENT,
} from '@/editor/codemirror-commands';
import { COPY, CUT, PASTE } from '@/editor/default-context-menu';
import { NEXT_DIAGNOSTIC, PREVIOUS_DIAGNOSTIC } from '@/editor/diagnostics';
import {
  BRANCH_DIFF,
  CLOSE_DIFF,
  NEXT_CHUNK,
  PREVIOUS_CHUNK,
  SPLIT_DIFF,
  UNCOMMITTED_DIFF,
  UNIFIED_DIFF,
  UNSTAGED_DIFF,
} from '@/editor/diff/commands';
import { FORMAT } from '@/editor/format';
import { SHOW_HOVER } from '@/editor/hover';
import { GO_TO_DEFINITION } from '@/editor/lsp/definition';
import { FIND_USAGES } from '@/editor/lsp/references';
import { RENAME } from '@/editor/lsp/rename';
import { SHOW_SIGNATURE_HELP } from '@/editor/lsp/signature-help';
import { OPEN_SETTINGS } from '@/settings/settings';

export const DEFAULT_COMMANDS: readonly (ApplicationCommand | EditorCommand)[] = [
  // Application
  OPEN_SETTINGS,
  // Clipboard
  CUT,
  COPY,
  PASTE,
  // Editor
  UNDO,
  REDO,
  UNDO_SELECTION,
  REDO_SELECTION,
  FIND,
  REPLACE,
  FIND_NEXT,
  FIND_PREVIOUS,
  SELECT_NEXT_OCCURRENCE,
  SELECT_ALL_OCCURRENCES,
  GO_TO_LINE,
  FOLD,
  UNFOLD,
  FOLD_ALL,
  UNFOLD_ALL,
  INDENT,
  UNINDENT,
  AUTO_INDENT,
  TOGGLE_LINE_COMMENT,
  TOGGLE_BLOCK_COMMENT,
  DUPLICATE_LINE,
  DUPLICATE_LINE_UP,
  DELETE_LINE,
  MOVE_LINE_UP,
  MOVE_LINE_DOWN,
  START_NEW_LINE,
  TOGGLE_TAB_FOCUS_MODE,
  FORMAT,
  ADD_CARET_ABOVE,
  ADD_CARET_BELOW,
  SELECT_LINE,
  EXTEND_SELECTION,
  MOVE_TO_MATCHING_BRACKET,
  SYNTAX_LEFT,
  SYNTAX_RIGHT,
  SELECT_SYNTAX_LEFT,
  SELECT_SYNTAX_RIGHT,
  SHOW_HOVER,
  SHOW_ACTIONS,
  APPLY_TOP_FIX,
  NEXT_DIAGNOSTIC,
  PREVIOUS_DIAGNOSTIC,
  // Diff
  UNSTAGED_DIFF,
  UNCOMMITTED_DIFF,
  BRANCH_DIFF,
  CLOSE_DIFF,
  NEXT_CHUNK,
  PREVIOUS_CHUNK,
  UNIFIED_DIFF,
  SPLIT_DIFF,
  // LSP
  GO_TO_DEFINITION,
  FIND_USAGES,
  RENAME,
  SHOW_SIGNATURE_HELP,
];

/**
 * The commands and their keys.
 */
export class CommandManager implements Commands {
  readonly application: Application;
  readonly keymap: ApplicationKeymap;
  private readonly listeners = new Set<() => void>();
  private addedCommands: ReadonlyArray<ReadonlyArray<ApplicationCommand | EditorCommand>> = [];
  private currentCommands: ReadonlyMap<string, ApplicationCommand | EditorCommand> = new Map();
  private currentSelected: Keymap = ELSEWISE.keymap;

  constructor(parts: Omit<Application, 'commands'>, platform?: Platform) {
    this.application = { ...parts, commands: this };
    this.keymap = new ApplicationKeymap(platform);
    this.add(DEFAULT_COMMANDS);
  }

  /**
   * The commands by id.
   */
  get commands(): ReadonlyMap<string, ApplicationCommand | EditorCommand> {
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
  add(commands: readonly (ApplicationCommand | EditorCommand)[]): Disposable {
    const ids = new Set(this.currentCommands.keys());
    const added = commands.filter((command) => {
      if (ids.has(command.id)) {
        console.warn(`Command ${command.id} already exists`);
        return false;
      }

      ids.add(command.id);
      return true;
    });
    this.addedCommands = [...this.addedCommands, added];
    this.update();
    return () => {
      this.addedCommands = this.addedCommands.filter((other) => other !== added);
      this.update();
    };
  }

  private update() {
    const commands = new Map<string, ApplicationCommand | EditorCommand>();
    for (const command of this.addedCommands.flat()) {
      commands.set(command.id, command);
    }

    this.keymap.update(this.currentSelected, commands.values());
    this.currentCommands = commands;
    this.notify();
  }

  run(id: string, view?: EditorView): boolean {
    const command = this.currentCommands.get(id);
    if (command === undefined) {
      console.warn(`Unknown command ${id}`);
      return false;
    }

    try {
      if (command.scope === 'editor') {
        const editor = view ?? this.application.editor.active;
        if (editor === null) {
          return false;
        }

        if (command.enabled?.(this.application, editor) === false) {
          return false;
        }

        return command.run(this.application, editor);
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

export const CommandManagerContext = createContext<CommandManager | null>(null);

export function useCommandManager(): CommandManager;
export function useCommandManager<T>(select: (commands: CommandManager) => T): T;
export function useCommandManager<T>(select?: (commands: CommandManager) => T): CommandManager | T {
  const commands = useContext(CommandManagerContext);
  if (commands === null) {
    throw new Error('Missing CommandManagerContext');
  }

  const subscribe = useCallback((listener: () => void) => commands.subscribe(listener), [commands]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? commands : select(commands)));
}
