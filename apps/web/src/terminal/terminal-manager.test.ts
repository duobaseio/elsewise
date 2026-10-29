import type { ContextMenuGroup } from '@elsewise/plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_CONTEXT_MENU } from '@/terminal/context-menu/default-context-menu';
import { TerminalManager } from '@/terminal/terminal-manager';

// Returns a terminal that stands in for xterm's, named `name`.
function terminal(name: string): XTerm {
  return { name } as unknown as XTerm;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activate', () => {
  test('ignores active terminal', () => {
    const terminals = new TerminalManager();
    const listener = vi.fn();
    const a = terminal('a');
    terminals.subscribe(listener);
    terminals.activate(a);
    terminals.activate(a);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('deactivate', () => {
  test('clears and notifies for active terminal', () => {
    const terminals = new TerminalManager();
    const listener = vi.fn();
    const a = terminal('a');
    terminals.activate(a);
    terminals.subscribe(listener);
    terminals.deactivate(a);

    expect(terminals.active).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  test('ignores another terminal', () => {
    const terminals = new TerminalManager();
    const listener = vi.fn();
    const a = terminal('a');
    terminals.activate(a);
    terminals.subscribe(listener);
    terminals.deactivate(terminal('b'));

    expect(terminals.active).toBe(a);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('addContextMenu', () => {
  test('adds groups until disposed', () => {
    const terminals = new TerminalManager();
    const added: ContextMenuGroup[] = [{ id: 'reactions', order: 50, items: [{ order: 10, command: 'shrug' }] }];
    const dispose = terminals.addContextMenu(added);

    expect(terminals.contextMenu).toEqual([...DEFAULT_CONTEXT_MENU, ...added]);

    dispose();

    expect(terminals.contextMenu).toEqual(DEFAULT_CONTEXT_MENU);
  });

  test('notifies on change', () => {
    const terminals = new TerminalManager();
    const listener = vi.fn();
    terminals.subscribe(listener);

    terminals.addContextMenu([{ id: 'reactions', items: [] }])();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('subscribe', () => {
  test('continues past throwing listener', () => {
    const terminals = new TerminalManager();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    terminals.subscribe(() => {
      throw new Error('boom');
    });
    terminals.subscribe(listener);

    terminals.activate(terminal('a'));

    expect(listener).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  test('stops notifying once disposed', () => {
    const terminals = new TerminalManager();
    const listener = vi.fn();
    terminals.subscribe(listener)();

    terminals.activate(terminal('a'));

    expect(listener).not.toHaveBeenCalled();
  });
});
