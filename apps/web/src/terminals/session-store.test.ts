import { create } from '@bufbuild/protobuf';
import type { WorkspaceId } from '@elsewise/frontend-plugin';
import { Code, TransportError } from '@elsewise/transport';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { type Daemon, daemonQuery } from '@/daemon';
import {
  CreateTerminalResponseSchema,
  DeleteTerminalResponseSchema,
  GetTerminalsResponseSchema,
  UpdateTerminalResponseSchema,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';
import { SessionStore } from '@/terminals/session-store';

const SINGAPORE: WorkspaceId = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };
const TOKYO = { ...SINGAPORE, session: 'tokyo-1' };
const OSAKA = { ...SINGAPORE, session: 'osaka-1' };

// A store over a daemon that has tokyo-1 and osaka-1 in Singapore, recording what it reports.
function setUp() {
  const terminal = { workspaceId: 'singapore', id: 'tokyo-1', name: 'Terminal', restore: true };
  const other = { workspaceId: 'singapore', id: 'osaka-1', name: 'Terminal (1)', restore: true };
  const createTerminal = vi.fn(async () => create(CreateTerminalResponseSchema, { terminal }));
  const getTerminals = vi.fn(async () => create(GetTerminalsResponseSchema, { terminals: [terminal, other] }));
  const updateTerminal = vi.fn(async ({ name }: { name: string }) =>
    create(UpdateTerminalResponseSchema, { terminal: { ...terminal, name } }),
  );
  const deleteTerminal = vi.fn(async () => create(DeleteTerminalResponseSchema));
  const attachTerminal = () => ({
    send: async () => {},
    close() {},
    cancel() {},
    responses: (async function* () {})(),
  });
  const client = new QueryClient();
  client.setQueryData(daemonQuery('local').queryKey, {
    terminals: { createTerminal, getTerminals, updateTerminal, deleteTerminal, attachTerminal },
  } as unknown as Daemon);
  return { store: new SessionStore(client), createTerminal, getTerminals, updateTerminal, deleteTerminal };
}

describe('add', () => {
  test('sends options', async () => {
    const { store, createTerminal } = setUp();

    await store.add(SINGAPORE, {
      name: 'Build',
      cwd: 'scripts',
      env: { NODE_ENV: 'test' },
      program: 'npm',
      args: ['test'],
      restore: false,
    });

    expect(createTerminal).toHaveBeenCalledExactlyOnceWith({
      workspaceId: 'singapore',
      name: 'Build',
      relativePath: 'scripts',
      env: { NODE_ENV: 'test' },
      program: 'npm',
      args: ['test'],
      restore: false,
    });
  });

  test('keeps session', async () => {
    const { store } = setUp();

    const session = await store.add(SINGAPORE);

    expect(session).toEqual({
      id: TOKYO,
      name: 'Terminal',
      cwd: '',
      program: '',
      args: [],
      restore: true,
      state: 'stopped',
      exit: null,
    });
    expect(store.sessions.get(TOKYO)).toEqual(session);
  });
});

describe('get', () => {
  test('returns session', async () => {
    const { store } = setUp();

    const session = await store.get(TOKYO);

    expect(session?.name).toBe('Terminal');
    expect(store.sessions.get(TOKYO)).toEqual(session);
  });

  test('returns kept session without daemon', async () => {
    const { store, getTerminals } = setUp();
    const session = await store.add(SINGAPORE);

    expect(await store.get(TOKYO)).toEqual(session);
    expect(getTerminals).not.toHaveBeenCalled();
  });

  test('shares request for workspace', async () => {
    const { store, getTerminals } = setUp();

    const [tokyo, osaka] = await Promise.all([store.get(TOKYO), store.get(OSAKA)]);

    expect(tokyo?.name).toBe('Terminal');
    expect(osaka?.name).toBe('Terminal (1)');
    expect(getTerminals).toHaveBeenCalledOnce();
  });
});

describe('rename', () => {
  test('renames session', async () => {
    const { store, updateTerminal } = setUp();
    await store.add(SINGAPORE);

    const session = await store.rename(TOKYO, 'Build');

    expect(updateTerminal).toHaveBeenCalledExactlyOnceWith({ terminalId: 'tokyo-1', name: 'Build' });
    expect(session.name).toBe('Build');
    expect(store.sessions.get(TOKYO)).toEqual(session);
  });
});

describe('delete', () => {
  test('deletes session', async () => {
    const { store, deleteTerminal } = setUp();
    await store.add(SINGAPORE);

    await store.delete(TOKYO);

    expect(deleteTerminal).toHaveBeenCalledExactlyOnceWith({ terminalId: 'tokyo-1' });
    expect(store.sessions.get(TOKYO)).toBeUndefined();
  });

  test('ignores session another client deleted', async () => {
    const { store, deleteTerminal } = setUp();
    deleteTerminal.mockRejectedValue(new TransportError(Code.NOT_FOUND, 'the terminal does not exist'));

    await expect(store.delete(TOKYO)).resolves.toBeUndefined();
  });

  test('keeps session the daemon failed to delete', async () => {
    const { store, deleteTerminal } = setUp();
    const session = await store.add(SINGAPORE);
    deleteTerminal.mockRejectedValue(new TransportError(Code.UNAVAILABLE, 'the daemon is busy'));

    await expect(store.delete(TOKYO)).rejects.toThrow('the daemon is busy');
    expect(store.sessions.get(TOKYO)).toEqual(session);
  });
});
