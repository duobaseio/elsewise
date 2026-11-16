import { PLATFORM } from '@elsewise/components/lib/platform';
import type { TerminalSessionId } from '@elsewise/frontend-plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { useApplicationManager } from '@/application-context';
import { CommandContextMenu, type CommandContextMenuProps } from '@/command/context-menu/context-menu';
import { useTerminalManager } from '@/terminal/terminal-manager';

/**
 * The terminal's context menu.
 *
 * A program that tracks the mouse, e.g. vim, gets right-clicks and long-presses instead, unless the key that keeps
 * xterm from sending them is held, as xterm decides it:
 * * on macOS, Option, with `macOptionClickForcesSelection` set.
 * * elsewhere, Shift.
 */
export function TerminalContextMenu({
  session,
  terminal,
  render,
}: {
  session: TerminalSessionId;
  terminal: XTerm | null;
  render: CommandContextMenuProps['render'];
}) {
  const { terminals } = useApplicationManager();
  const menu = useTerminalManager((manager) => manager.contextMenu);
  return (
    <CommandContextMenu
      menu={menu}
      target={{ current: terminals.get(session) }}
      opens={(event) => {
        if (terminal === null || terminal.modes.mouseTrackingMode === 'none') {
          return true;
        }

        return PLATFORM === 'mac'
          ? 'altKey' in event && event.altKey === true && terminal.options.macOptionClickForcesSelection === true
          : 'shiftKey' in event && event.shiftKey === true;
      }}
      onClosed={() => terminal?.focus()}
      render={render}
    />
  );
}
