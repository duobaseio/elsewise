import type { TerminalSession } from '@elsewise/frontend-plugin';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import type { ApplicationManager } from '@/application-manager';
import type { DockManager } from '@/dock/dock-manager';
import { closeTerminal } from './close-terminal';
import { TerminalManager } from './terminal-manager';

const ID = { daemon: 'd', project: 'p', workspace: 'w', session: '1' };
const PANEL = { id: 'terminal:1', type: 'terminal', tab: true, closable: true, session: ID } as const;

// Terminals that have a session in `state`, and what closing its panel returns when the dialog is closed with
// `confirmed`.
function open(state: TerminalSession['state'], confirmed = true) {
  const terminals = new TerminalManager(new QueryClient());
  const session = { id: ID, name: 'Terminal', cwd: '', program: '', args: [], restore: true, state, exit: null };
  terminals.store.sessions.set(ID, session);
  const deleted = vi.spyOn(terminals, 'delete').mockResolvedValue();
  const asked = vi.spyOn(terminals, 'openCloseDialog').mockResolvedValue(confirmed);
  const close = (closeConfirmation: boolean) =>
    closeTerminal({ terminals } as ApplicationManager, {} as DockManager, { ...PANEL, closeConfirmation });
  return { terminals, session, deleted, asked, close };
}

describe('closeTerminal', () => {
  test('deletes terminal without asking', async () => {
    const { deleted, asked, close } = open('running');

    await expect(close(false)).resolves.toBe(true);

    expect(deleted).toHaveBeenCalledExactlyOnceWith(ID);
    expect(asked).not.toHaveBeenCalled();
  });

  test('asks before deleting terminal with close confirmation', async () => {
    const { session, deleted, asked, close } = open('running');

    await expect(close(true)).resolves.toBe(true);

    expect(asked).toHaveBeenCalledExactlyOnceWith(session);
    expect(deleted).toHaveBeenCalledExactlyOnceWith(ID);
  });

  test('asks before deleting terminal whose session is not loaded', async () => {
    const { session, deleted, asked, close, terminals } = open('running');
    terminals.store.sessions.delete(ID);
    const fetched = vi.spyOn(terminals.store, 'get').mockResolvedValue(session);

    await expect(close(true)).resolves.toBe(true);

    expect(fetched).toHaveBeenCalledExactlyOnceWith(ID);
    expect(asked).toHaveBeenCalledExactlyOnceWith(session);
    expect(deleted).toHaveBeenCalledExactlyOnceWith(ID);
  });

  test('deletes terminal whose session is gone without asking', async () => {
    const { deleted, asked, close, terminals } = open('running');
    terminals.store.sessions.delete(ID);
    vi.spyOn(terminals.store, 'get').mockResolvedValue(null);

    await expect(close(true)).resolves.toBe(true);

    expect(deleted).toHaveBeenCalledExactlyOnceWith(ID);
    expect(asked).not.toHaveBeenCalled();
  });

  test('keeps terminal that is not confirmed', async () => {
    const { deleted, close } = open('running', false);

    await expect(close(true)).resolves.toBe(false);

    expect(deleted).not.toHaveBeenCalled();
  });

  test('deletes terminal whose program is not running without asking', async () => {
    const { deleted, asked, close } = open('exited');

    await expect(close(true)).resolves.toBe(true);

    expect(deleted).toHaveBeenCalledExactlyOnceWith(ID);
    expect(asked).not.toHaveBeenCalled();
  });

  test('rejects when terminal is not deleted', async () => {
    const { deleted, close } = open('running');
    deleted.mockRejectedValue(new Error('unreachable'));

    await expect(close(false)).rejects.toThrow('unreachable');
  });
});
