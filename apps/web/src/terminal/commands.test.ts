import type { TerminalView } from '@elsewise/frontend-plugin';
import { describe, expect, test } from 'vitest';
import { TERMINAL_COPY } from '@/terminal/commands';
import { builtInApplication } from '../../test/commands';

// Returns a terminal that only has a selection when `selected`.
function view(selected: boolean): TerminalView {
  return { terminal: { hasSelection: () => selected } } as unknown as TerminalView;
}

describe('TERMINAL_COPY', () => {
  test('shows with selection only', () => {
    const application = builtInApplication();

    expect(TERMINAL_COPY.shown?.(application, view(true))).toBe(true);
    expect(TERMINAL_COPY.shown?.(application, view(false))).toBe(false);
  });
});
