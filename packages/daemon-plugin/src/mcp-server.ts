import type { Disposable } from '@elsewise/plugin';
import type { AgentSession } from './agent';

/**
 * The Model Context Protocol servers every agent is given.
 */
export interface McpServers {
  /**
   * Adds a server, which sessions get the next time they are created or loaded.
   *
   * Throws an error if a server with the same name has been added.
   */
  add(server: McpServer): Disposable;
}

/**
 * A program that speaks the Model Context Protocol over its stdin and stdout.
 */
export interface McpServer {
  /**
   * The mcp name which is unique across plugins.
   */
  readonly name: string;

  /**
   * Returns the process an agent starts for a session.
   *
   * Throwing an error leaves the server out of the session.
   */
  start(session: AgentSession): McpServerProcess | Promise<McpServerProcess>;
}

/**
 * The process a Model Context Protocol server runs as.
 */
export interface McpServerProcess {
  /**
   * The program to run.
   */
  readonly program: string;

  /**
   * The arguments.
   */
  readonly args?: readonly string[];

  /**
   * Environment variables.
   */
  readonly env?: Readonly<Record<string, string>>;
}
