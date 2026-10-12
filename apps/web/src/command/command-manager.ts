import type { EditorView } from '@codemirror/view';
import type { Application, ApplicationCommand, Commands, Disposable, EditorCommand } from '@elsewise/plugin';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveTheme } from '@/appearance/themes';
import { EditorManager } from '@/editor/editor-manager';

export class CommandManager implements Commands {
  private readonly application: Application;
  private readonly listeners = new Set<() => void>();
  private added: ReadonlyArray<ReadonlyArray<EditorCommand | ApplicationCommand>> = [];
  private current: ReadonlyMap<string, EditorCommand | ApplicationCommand> = new Map();

  constructor(
    appearance: AppearanceManager,
    private readonly editor: EditorManager,
  ) {
    this.application = { appearance, editor, commands: this };
  }

  /**
   * The commands by id.
   */
  get commands(): ReadonlyMap<string, EditorCommand | ApplicationCommand> {
    return this.current;
  }

  /**
   * Adds `commands`, replacing earlier commands with the same ids.
   *
   * Returns a disposable that removes the `commands`.
   */
  add(commands: readonly (EditorCommand | ApplicationCommand)[]): Disposable {
    // Copy to guard against future mutations to `commands`.
    const added = [...commands];
    this.added = [added, ...this.added];
    this.update();
    return () => {
      this.added = this.added.filter((other) => other !== added);
      this.update();
    };
  }

  private update() {
    const commands = new Map<string, EditorCommand | ApplicationCommand>();
    for (const command of this.added.flat()) {
      if (!commands.has(command.id)) {
        commands.set(command.id, command);
      }
    }

    this.current = commands;
    this.notify();
  }

  run(id: string, view?: EditorView): boolean {
    const command = this.current.get(id);
    if (command === undefined) {
      console.warn(`Unknown command ${id}`);
      return false;
    }

    try {
      if (command.scope === 'editor') {
        const editor = view ?? this.editor.active;
        if (editor === null || command.enabled?.(this.application, editor) === false) {
          return false;
        }

        command.run(this.application, editor);
        return true;
      }

      if (command.enabled?.(this.application) === false) {
        return false;
      }

      command.run(this.application);
      return true;
    } catch (error) {
      console.error(`Command ${command.label} failed`, error);
      return true;
    }
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

export const CommandManagerContext = createContext(
  new CommandManager(
    new AppearanceManager('dark', resolveTheme([], { source: 'elsewise', name: 'elsewise' }, 'dark')),
    new EditorManager(),
  ),
);

export function useCommandManager(): CommandManager;
export function useCommandManager<T>(select: (commands: CommandManager) => T): T;
export function useCommandManager<T>(select?: (commands: CommandManager) => T): CommandManager | T {
  const commands = useContext(CommandManagerContext);
  const subscribe = useCallback((listener: () => void) => commands.subscribe(listener), [commands]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? commands : select(commands)));
}
