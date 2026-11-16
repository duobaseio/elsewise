import type { Disposable } from '@elsewise/plugin';
import type { Terminal } from '@xterm/xterm';
import type { ContextMenuGroup } from './context-menu';
import type { WorkspaceId } from './projects/workspaces';

/**
 * A shell's exit code or signal that killed it, e.g. SIGKILL.
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
  readonly active: ActiveTerminal | null;

  /**
   * Returns the sessions of `workspace`, oldest first.
   */
  list(workspace: WorkspaceId): Promise<readonly TerminalSession[]>;

  /**
   * Adds a session to `workspace`.
   *
   * The name defaults to the project and workspace names with a number, e.g. `elsewise-main-1`.
   */
  add(workspace: WorkspaceId, options?: { name?: string }): Promise<TerminalSession>;

  /**
   * Renames `session`.
   */
  rename(session: TerminalSessionId, name: string): Promise<TerminalSession>;

  /**
   * Deletes `session` and kills its shell.
   */
  delete(session: TerminalSessionId): Promise<void>;

  /**
   * Returns the terminal for `session` in this window, or null if it is not shown.
   *
   * ```ts
   * app.terminals.terminal(session)?.input('npm test\r');
   * ```
   */
  terminal(session: TerminalSessionId): Terminal | null;

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
 * The active terminal and its session.
 */
export interface ActiveTerminal {
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
