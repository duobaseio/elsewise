import type { EditorView } from '@codemirror/view';
import type { Key, Keys } from './keymap.ts';
import type { Application, Disposable } from './plugin.ts';

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
  add(commands: readonly (EditorCommand | ApplicationCommand)[]): Disposable;

  /**
   * Runs the command with `id` against an optional `target`.
   *
   * Does nothing if the command is unknown, has nothing to run against, or is disabled.
   */
  run(id: string, target?: EditorView): void;
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
   */
  run(application: Application): void;
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
   * Runs the command against `view`.
   */
  run(application: Application, view: EditorView): void;
}
