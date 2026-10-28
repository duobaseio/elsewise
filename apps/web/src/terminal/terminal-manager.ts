import type { Disposable, Terminal } from '@elsewise/plugin';
import type { Terminal as XTerm } from '@xterm/xterm';
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

/**
 * The terminal as plugins see it.
 */
export class TerminalManager implements Terminal {
  private readonly listeners = new Set<() => void>();
  private current: XTerm | null = null;

  get active(): XTerm | null {
    return this.current;
  }

  /**
   * Makes `terminal` the active terminal.
   */
  activate(terminal: XTerm): void {
    if (this.current !== terminal) {
      this.current = terminal;
      this.notify();
    }
  }

  /**
   * Makes the active terminal null if it is `terminal`.
   */
  deactivate(terminal: XTerm): void {
    if (this.current === terminal) {
      this.current = null;
      this.notify();
    }
  }

  subscribe(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Terminal listener failed', error);
      }
    }
  }
}

export const TerminalManagerContext = createContext<TerminalManager | null>(null);

export function useTerminalManager(): TerminalManager;
export function useTerminalManager<T>(select: (terminal: TerminalManager) => T): T;
export function useTerminalManager<T>(select?: (terminal: TerminalManager) => T): TerminalManager | T {
  const terminal = useContext(TerminalManagerContext);
  if (terminal === null) {
    throw new Error('Missing TerminalManagerContext');
  }

  const subscribe = useCallback((listener: () => void) => terminal.subscribe(listener), [terminal]);
  return useSyncExternalStore(subscribe, () => (select === undefined ? terminal : select(terminal)));
}
