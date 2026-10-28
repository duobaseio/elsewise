import type { Terminal as XTerm } from '@xterm/xterm';

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
}
