import { PLATFORM } from '@elsewise/components/lib/platform';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { ReactNode } from 'react';
import { CommandContextMenu } from '@/command/context-menu';
import { useTerminalManager } from '@/terminal/terminal-manager';

/**
 * The terminal's context menu.
 *
 * A program that tracks the mouse, e.g. vim, gets right-clicks and long-presses instead, unless the key that keeps
 * xterm from sending them is held, as xterm decides it:
 * * on macOS, Option, with `macOptionClickForcesSelection` set.
 * * elsewhere, Shift.
 */
export function TerminalContextMenu({ terminal, children }: { terminal: XTerm | null; children: ReactNode }) {
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
      className="h-full"
    >
      {children}
    </CommandContextMenu>
  );
}
