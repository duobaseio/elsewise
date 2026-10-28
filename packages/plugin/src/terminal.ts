import type { Terminal as XTerm } from '@xterm/xterm';
import type { ContextMenuGroup } from './context-menu.ts';
import type { Disposable } from './plugin.ts';

/**
 * The terminal.
 */
export interface Terminal {
  /**
   * The open terminal that is or was last focused.
   *
   * `null` when:
   * * no terminal has focused yet.
   * * the active terminal is closed and focus has not shifted to another open terminal.
   *
   * The active terminal remains the same when focus is elsewhere (except on another terminal), e.g. in a menu.
   */
  readonly active: XTerm | null;

  /**
   * Adds `groups`, and their items, to the context menu.
   *
   * See {@link ContextMenuGroup} for adding to a built-in group or submenu.
   *
   * Returns a disposable that removes the `groups`.
   */
  addContextMenu(groups: readonly ContextMenuGroup[]): Disposable;
}
