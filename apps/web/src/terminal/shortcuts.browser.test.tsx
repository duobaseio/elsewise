import { PLATFORM } from '@elsewise/components/lib/platform';
import type { Terminal } from '@xterm/xterm';
import { describe, expect, test, vi } from 'vitest';
import { TerminalShortcuts } from '@/terminal/shortcuts';

// Returns `shortcuts` activated on a terminal that only takes the key handler, and a function to press a key in it.
function activate(shortcuts: TerminalShortcuts) {
  let handler: (event: KeyboardEvent) => boolean = () => true;
  const terminal = {
    attachCustomKeyEventHandler: (custom: (event: KeyboardEvent) => boolean) => {
      handler = custom;
    },
  } as unknown as Terminal;
  shortcuts.activate(terminal);
  const press = (key: string, modifiers: KeyboardEventInit = chord()) =>
    handler(new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers }));
  return { terminal, press };
}

function chord(): KeyboardEventInit {
  return PLATFORM === 'mac' ? { metaKey: true } : { ctrlKey: true, shiftKey: true };
}

describe('TerminalShortcuts', () => {
  test('runs shortcut on chord, keeping key from shell', () => {
    const run = vi.fn();
    const { terminal, press } = activate(new TerminalShortcuts([{ key: 'f', run }]));

    expect(press('f')).toBe(false);
    expect(run).toHaveBeenCalledWith(terminal);
  });

  test('passes other keys to shell', () => {
    const run = vi.fn();
    const { press } = activate(new TerminalShortcuts([{ key: 'f', run }]));

    expect(press('g')).toBe(true);
    expect(press('f', {})).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  test('stops running disposed shortcut', () => {
    const shortcuts = new TerminalShortcuts([]);
    const run = vi.fn();
    const { press } = activate(shortcuts);
    shortcuts.add([{ key: 'f', run }]).dispose();

    expect(press('f')).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});
