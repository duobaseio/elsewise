import type { EditorView } from '@codemirror/view';
import type { Platform } from '@elsewise/components/lib/platform';
import type {
  ActiveKeymap,
  Command,
  CommandGroup,
  Commands,
  Disposable,
  FileTreeSelection,
  Keymap,
  Project,
  Workspace,
} from '@elsewise/frontend-plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { useCallback, useSyncExternalStore } from 'react';
import { useApplicationManager } from '@/application-context';
import type { ApplicationManager } from '@/application-manager';
import {
  APPLICATION,
  EDITOR,
  EDITOR_CODE,
  EDITOR_DIFF,
  EDITOR_EDIT,
  EDITOR_NAVIGATE,
  FILE_TREE,
  PROJECT,
  TERMINAL,
  WORKSPACE,
} from '@/command/groups';
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
import {
  FILE_TREE_CANCEL_CUT,
  FILE_TREE_COPY,
  FILE_TREE_COPY_PATH,
  FILE_TREE_COPY_RELATIVE_PATH,
  FILE_TREE_CUT,
  FILE_TREE_DELETE,
  FILE_TREE_NEW_FILE,
  FILE_TREE_NEW_FOLDER,
  FILE_TREE_OPEN_FILE_MANAGER,
  FILE_TREE_PASTE,
  FILE_TREE_RENAME,
} from '@/fs/commands';
import {
  PROJECT_COPY_PATH,
  PROJECT_DELETE,
  PROJECT_IMPORT_WORKSPACE,
  PROJECT_NEW_WORKSPACE,
  PROJECT_OPEN_FILE_MANAGER,
  PROJECT_RENAME,
  WORKSPACE_COPY_PATH,
  WORKSPACE_DELETE,
  WORKSPACE_MARK_READ,
  WORKSPACE_OPEN_FILE_MANAGER,
  WORKSPACE_RENAME,
} from '@/projects/commands';
import { OPEN_SETTINGS } from '@/settings/settings';
import { TERMINAL_CLEAR, TERMINAL_COPY, TERMINAL_PASTE, TERMINAL_SELECT_ALL } from '@/terminal/commands';
import { TERMINAL_FIND } from '@/terminal/search/commands';

export const DEFAULT_GROUPS: readonly CommandGroup[] = [
  APPLICATION,
  EDITOR,
  EDITOR_CODE,
  EDITOR_DIFF,
  EDITOR_EDIT,
  EDITOR_NAVIGATE,
  TERMINAL,
  FILE_TREE,
  PROJECT,
  WORKSPACE,
];

export const DEFAULT_COMMANDS: readonly Command[] = [
  // Application
  OPEN_SETTINGS,
  // Project
  PROJECT_NEW_WORKSPACE,
  PROJECT_IMPORT_WORKSPACE,
  PROJECT_COPY_PATH,
  PROJECT_RENAME,
  PROJECT_DELETE,
  PROJECT_OPEN_FILE_MANAGER,
  // Workspace
  WORKSPACE_COPY_PATH,
  WORKSPACE_RENAME,
  WORKSPACE_DELETE,
  WORKSPACE_MARK_READ,
  WORKSPACE_OPEN_FILE_MANAGER,
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
  // File tree
  FILE_TREE_NEW_FILE,
  FILE_TREE_NEW_FOLDER,
  FILE_TREE_CUT,
  FILE_TREE_COPY,
  FILE_TREE_COPY_PATH,
  FILE_TREE_COPY_RELATIVE_PATH,
  FILE_TREE_PASTE,
  FILE_TREE_CANCEL_CUT,
  FILE_TREE_RENAME,
  FILE_TREE_DELETE,
  FILE_TREE_OPEN_FILE_MANAGER,
];

/**
 * The commands and their keys.
 */
export class CommandManager implements Commands {
  readonly keymap: ApplicationKeymap;
  private readonly listeners = new Set<() => void>();
  private addedGroups: ReadonlyArray<ReadonlyArray<CommandGroup>> = [];
  private currentGroups: ReadonlyMap<string, CommandGroup> = new Map();
  private addedCommands: ReadonlyArray<ReadonlyArray<Command>> = [];
  private currentCommands: ReadonlyMap<string, Command> = new Map();
  private currentSelected: Keymap;

  constructor(
    private readonly application: ApplicationManager,
    selected: Keymap,
    platform?: Platform,
  ) {
    this.keymap = new ApplicationKeymap(platform);
    this.currentSelected = selected;
    this.addGroups(DEFAULT_GROUPS);
    this.add(DEFAULT_COMMANDS);
  }

  /**
   * The groups by id, in order of addition.
   */
  get groups(): ReadonlyMap<string, CommandGroup> {
    return this.currentGroups;
  }

  /**
   * The commands by id.
   */
  get commands(): ReadonlyMap<string, Command> {
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
  addGroups(groups: readonly CommandGroup[]): Disposable {
    const ids = new Set(this.currentGroups.keys());
    const added = groups.filter((group) => {
      if (ids.has(group.id)) {
        console.warn(`Command group ${group.id} already exists`);
        return false;
      }

      if (group.in !== undefined && !ids.has(group.in)) {
        console.warn(`Command group ${group.id} is in unknown group ${group.in}`);
        return false;
      }

      ids.add(group.id);
      return true;
    });
    this.addedGroups = [...this.addedGroups, added];
    this.update();
    return () => {
      // A group is added after the one it is in, so one pass in that order reaches every nested group.
      const removed = new Set(added.map((group) => group.id));
      this.addedGroups = this.addedGroups.map((other) =>
        other.filter((group) => {
          if (group.in !== undefined && removed.has(group.in)) {
            removed.add(group.id);
          }
          return !removed.has(group.id);
        }),
      );
      this.addedCommands = this.addedCommands.map((other) => other.filter((command) => !removed.has(command.group)));
      this.update();
    };
  }

  /**
   * {@inheritDoc}
   */
  add(commands: readonly Command[]): Disposable {
    const ids = new Set(this.currentCommands.keys());
    const added = commands.filter((command) => {
      if (ids.has(command.id)) {
        console.warn(`Command ${command.id} already exists`);
        return false;
      }

      if (!this.currentGroups.has(command.group)) {
        console.warn(`Command ${command.id} is in unknown group ${command.group}`);
        return false;
      }

      ids.add(command.id);
      return true;
    });
    this.addedCommands = [...this.addedCommands, added];
    this.update();
    return () => {
      // By command rather than addition, since removing a group may have thinned the addition already.
      this.addedCommands = this.addedCommands.map((other) => other.filter((command) => !added.includes(command)));
      this.update();
    };
  }

  private update() {
    const groups = new Map<string, CommandGroup>();
    for (const group of this.addedGroups.flat()) {
      groups.set(group.id, group);
    }
    this.currentGroups = groups;

    const commands = new Map<string, Command>();
    for (const command of this.addedCommands.flat()) {
      commands.set(command.id, command);
    }

    this.keymap.update(this.currentSelected, commands.values());
    this.currentCommands = commands;
    this.notify();
  }

  run(id: string, target?: Project | Workspace | EditorView | XTerm | FileTreeSelection): boolean {
    const command = this.currentCommands.get(id);
    if (command === undefined) {
      console.warn(`Unknown command ${id}`);
      return false;
    }

    try {
      if (command.scope === 'project') {
        if (target === undefined) {
          return false;
        }

        if (!isProject(target)) {
          console.warn(`Command ${id} runs on a project`);
          return false;
        }

        if (command.enabled?.(this.application, target) === false) {
          return false;
        }

        return command.run(this.application, target);
      }

      if (command.scope === 'workspace') {
        if (target !== undefined && !isWorkspace(target)) {
          console.warn(`Command ${id} runs on a workspace`);
          return false;
        }

        const workspace = target ?? this.application.projects.workspaces.active;
        if (workspace === null) {
          return false;
        }

        if (command.enabled?.(this.application, workspace) === false) {
          return false;
        }

        return command.run(this.application, workspace);
      }

      if (command.scope === 'editor') {
        if (target !== undefined && !isEditor(target)) {
          console.warn(`Command ${id} runs in an editor`);
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
          console.warn(`Command ${id} runs in a terminal`);
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

      if (command.scope === 'fileTree') {
        if (target === undefined) {
          return false;
        }

        if (!isFileTreeSelection(target)) {
          console.warn(`Command ${id} runs on a file tree selection`);
          return false;
        }

        if (command.enabled?.(this.application, target) === false) {
          return false;
        }

        return command.run(this.application, target);
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

export function isProject(target: Project | Workspace | EditorView | XTerm | FileTreeSelection): target is Project {
  return 'absolutePath' in target && !('main' in target);
}

export function isWorkspace(target: Project | Workspace | EditorView | XTerm | FileTreeSelection): target is Workspace {
  return 'absolutePath' in target && 'main' in target;
}

export function isEditor(target: Project | Workspace | EditorView | XTerm | FileTreeSelection): target is EditorView {
  return !('absolutePath' in target) && !('paths' in target) && !('buffer' in target);
}

export function isTerminal(target: Project | Workspace | EditorView | XTerm | FileTreeSelection): target is XTerm {
  return 'buffer' in target;
}

export function isFileTreeSelection(
  target: Project | Workspace | EditorView | XTerm | FileTreeSelection,
): target is FileTreeSelection {
  return 'paths' in target;
}

export function useCommandManager(): CommandManager;
export function useCommandManager<T>(select: (commands: CommandManager) => T): T;
export function useCommandManager<T>(select?: (commands: CommandManager) => T): CommandManager | T {
  const commands = useApplicationManager().commands;
  const subscribe = useCallback((listener: () => void) => commands.subscribe(listener), [commands]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? commands : select(commands)));
}
