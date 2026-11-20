import type { TerminalOptions, TerminalSession, TerminalSessionId, WorkspaceId } from '@elsewise/frontend-plugin';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { KeyedMap } from '@/collections/keyed-map';

import { daemonQuery } from '@/daemon';
import {
  DeleteTerminalsResponse_Failure_Reason as DeleteReason,
  type Terminal as TerminalMessage,
} from '@/gen/elsewise/daemon/terminal/v1/terminal_service_pb';

function keyOf(id: TerminalSessionId): readonly unknown[] {
  return [id.daemon, id.session];
}

/**
 * Returns the query for the terminals of `workspace`.
 */
function terminalsQuery(workspace: WorkspaceId) {
  return queryOptions({
    queryKey: [
      'daemons',
      workspace.daemon,
      'projects',
      workspace.project,
      'workspaces',
      workspace.workspace,
      'terminals',
    ],
    queryFn: async ({ client }) => {
      const daemon = await client.query(daemonQuery(workspace.daemon));
      return (await daemon.terminals.getTerminals({ workspaceId: workspace.workspace })).terminals;
    },
  });
}

/**
 * The terminal sessions on the daemons.
 */
export class SessionStore {
  readonly sessions = new KeyedMap<TerminalSessionId, TerminalSession>(keyOf);

  constructor(private readonly client: QueryClient) {}

  async add(id: WorkspaceId, options: TerminalOptions = {}): Promise<TerminalSession> {
    const daemon = await this.client.query(daemonQuery(id.daemon));
    const { terminal } = await daemon.terminals.createTerminal({
      workspaceId: id.workspace,
      name: options.name,
      relativePath: options.cwd,
      env: { ...options.env },
      program: options.program,
      args: [...(options.args ?? [])],
      restore: options.restore,
    });
    if (terminal === undefined) {
      throw new Error('The daemon sent no terminal.');
    }

    const session = this.mapSession(id, terminal);
    this.sessions.set(session.id, session);
    return session;
  }

  async get(id: TerminalSessionId): Promise<TerminalSession | null> {
    const existing = this.sessions.get(id);
    if (existing !== undefined) {
      return existing;
    }

    const terminals = await this.client.fetchQuery({ ...terminalsQuery(id), staleTime: 0 });
    const message = terminals.find((terminal) => terminal.id === id.session);
    if (message === undefined) {
      return null;
    }

    const session = this.mapSession(id, message);
    this.sessions.set(id, session);
    return session;
  }

  async rename(session: TerminalSessionId, name: string): Promise<TerminalSession> {
    const daemon = await this.client.query(daemonQuery(session.daemon));
    const { terminal } = await daemon.terminals.updateTerminal({ terminalId: session.session, name });
    if (terminal === undefined) {
      throw new Error('The daemon sent no terminal.');
    }

    const renamed = this.mapSession(session, terminal);
    this.sessions.set(session, renamed);
    return renamed;
  }

  async delete(session: TerminalSessionId): Promise<void> {
    const daemon = await this.client.query(daemonQuery(session.daemon));
    const { failures } = await daemon.terminals.deleteTerminals({ terminalIds: [session.session] });
    const failure = failures.find((failure) => failure.reason !== DeleteReason.NOT_FOUND);
    if (failure) {
      throw new Error(failure.message);
    }
    this.sessions.delete(session);
  }

  private mapSession(workspace: WorkspaceId, message: TerminalMessage): TerminalSession {
    const exit = message.state.case === 'exited' ? message.state.value.exit?.cause : undefined;
    return {
      id: { daemon: workspace.daemon, project: workspace.project, workspace: workspace.workspace, session: message.id },
      name: message.name,
      cwd: message.relativePath,
      program: message.program,
      args: message.args,
      restore: message.restore,
      state: message.state.case ?? 'stopped',
      exit: exit?.case === 'code' ? { code: exit.value } : exit?.case === 'signal' ? { signal: exit.value } : null,
    };
  }
}
