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

/**
 * The commands and their keys.
 */
export class CommandManager implements Commands {
  readonly application: Application;
  readonly keymap: ApplicationKeymap;
  private readonly listeners = new Set<() => void>();
  private addedCommands: ReadonlyArray<ReadonlyArray<EditorCommand | ApplicationCommand>> = [];
  private currentCommands: ReadonlyMap<string, EditorCommand | ApplicationCommand> = new Map();
  private currentSelected: Keymap = ELSEWISE.keymap;

  constructor(parts: Omit<Application, 'commands'>, platform?: Platform) {
    this.application = { ...parts, commands: this };
    this.keymap = new ApplicationKeymap(platform);
    this.keymap.update(this.currentSelected, []);
  }

  /**
   * The commands by id.
   */
  get commands(): ReadonlyMap<string, EditorCommand | ApplicationCommand> {
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
   * Adds `commands`, replacing earlier commands with the same ids.
   *
   * Returns a disposable that removes the `commands`.
   */
  add(commands: readonly (EditorCommand | ApplicationCommand)[]): Disposable {
    const added = [...commands];
    this.addedCommands = [added, ...this.addedCommands];
    this.update();
    return () => {
      this.addedCommands = this.addedCommands.filter((other) => other !== added);
      this.update();
    };
  }

  private update() {
    const commands = new Map<string, EditorCommand | ApplicationCommand>();
    for (const command of this.addedCommands.flat()) {
      if (!commands.has(command.id)) {
        commands.set(command.id, command);
      }
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
