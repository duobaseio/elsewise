import type { Terminal } from '@xterm/xterm';
import { describe, expect, test } from 'vitest';
import { TERMINAL_COPY } from '@/terminal/commands';
import { builtInCommands } from '../../test/commands';

// Returns a terminal that only has a selection when `selected`.
function terminal(selected: boolean): Terminal {
  return { hasSelection: () => selected } as unknown as Terminal;
}

describe('TERMINAL_COPY', () => {
  test('shows with selection only', () => {
    const { application } = builtInCommands();

    expect(TERMINAL_COPY.shown?.(application, terminal(true))).toBe(true);
    expect(TERMINAL_COPY.shown?.(application, terminal(false))).toBe(false);
  });
});
