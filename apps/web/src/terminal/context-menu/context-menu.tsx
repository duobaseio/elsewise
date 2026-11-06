import { PLATFORM } from '@elsewise/components/lib/platform';
import type { Terminal as XTerm } from '@xterm/xterm';
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
  terminal,
  render,
}: {
  terminal: XTerm | null;
  render: CommandContextMenuProps['render'];
}) {
  const menu = useTerminalManager((terminals) => terminals.contextMenu);
  return (
    <CommandContextMenu
      menu={menu}
      target={{ current: terminal }}
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
