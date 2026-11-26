import type { Disposable } from '@elsewise/plugin';
import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import type { ContextMenuGroup } from './context-menu';
import type { WorkspaceId } from './projects/workspaces';

/**
 * A shell's exit code or signal that killed it (e.g. SIGKILL).
 */
export type TerminalExit = { readonly code: number } | { readonly signal: string };

/**
 * The terminals.
 */
export interface Terminals {
  /**
   * The open terminal that is or was last focused.
   *
   * `null` when:
   * * no terminal has been focused yet.
   * * the active terminal is closed and focus has not shifted to another open terminal.
   *
   * The active terminal remains the same when focus is elsewhere (except on another terminal), e.g. in a menu.
   */
  readonly active: TerminalView | null;

  /**
   * Returns the open terminals.
   */
  list(): readonly TerminalView[];

  /**
   * Returns the open terminal with the given id, or null otherwise.
   */
  get(session: TerminalSessionId): TerminalView | null;

  /**
   * Adds `addons` to the terminals, each a function that returns one for each terminal.
   *
   * An addon is added to a terminal when the terminal is first shown.
   *
   * ```ts
   * terminals.addAddons([
   *   // In every terminal.
   *   () => new WebLinksAddon(),
   *
   *   // In the terminals of the main workspace only.
   *   ({ session }) => (session.id.workspace === 'main' ? new CommandLogger() : null),
   * ]);
   * ```
   *
   * Returns a disposable that removes the `addons`.
   */
  addAddons(addons: readonly ((view: TerminalView) => ITerminalAddon | null)[]): Disposable;

  /**
   * Adds `groups`, and their items, to the context menu.
   *
   * See {@link ContextMenuGroup} for adding to a built-in group or submenu.
   *
   * Returns a disposable that removes the `groups`.
   */
  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable;
}

/**
 * The options of a new terminal.
 */
export interface TerminalOptions {
  /**
   * Defaults to `Terminal`, or `Terminal (1)` if that name is taken.
   */
  readonly name?: string;

  /**
   * The folder to start in, relative to the workspace's root. Defaults to the workspace's root.
   */
  readonly cwd?: string;

  /**
   * The variables added to the environment.
   */
  readonly env?: Readonly<Record<string, string>>;

  /**
   * The program to run (e.g. `npm`). Defaults to the user's login shell.
   */
  readonly program?: string;

  /**
   * The program's arguments (e.g. `['run', 'dev']`).
   */
  readonly args?: readonly string[];

  /**
   * Whether to reopen the terminal, running `program` again, when Elsewise restarts. Defaults to true.
   */
  readonly restore?: boolean;

  /**
   * Whether to display a confirmation dialog before closing the terminal. Defaults to false.
   */
  readonly closeConfirmation?: boolean;
}

/**
 * A terminal and its session.
 */
export interface TerminalView {
  readonly session: TerminalSession;
  readonly terminal: Terminal;
}

/**
 * A terminal session's id.
 */
export interface TerminalSessionId extends WorkspaceId {
  readonly session: string;
}

/**
 * A terminal session.
 */
export interface TerminalSession {
  readonly id: TerminalSessionId;

  readonly name: string;

  /**
   * The folder to start in, relative to the workspace's root. Empty is the workspace's root.
   */
  readonly cwd: string;

  /**
   * The program to run. Empty is the user's login shell.
   */
  readonly program: string;

  /**
   * The program's arguments.
   */
  readonly args: readonly string[];

  /**
   * Whether to reopen the terminal, running `program` again, when Elsewise restarts.
   */
  readonly restore: boolean;

  /**
   * The shell's state:
   * * `stopped` until a terminal shows the session, and again after the daemon restarts.
   * * `running` while it runs.
   * * `exited` once it has ended.
   */
  readonly state: 'stopped' | 'running' | 'exited';

  /**
   * How the shell ended, or null if it has not.
   */
  readonly exit: TerminalExit | null;
}
