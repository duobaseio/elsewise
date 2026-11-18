import type { Disposable } from '@elsewise/plugin';

/** The agents users can start sessions with. */
export interface Agents {
  /**
   * Adds an agent.
   *
   * Throws an error if the plugin has already added an agent with the same `id`.
   */
  add(agent: Agent): Disposable;
}

/** A program that speaks the Agent Client Protocol over its stdin and stdout. */
export interface Agent {
  /**
   * The id that tells the plugin's agents apart (e.g. `claude` in `@acme/agents/claude`).
   *
   * A plugin with a single agent returns undefined.
   */
  readonly id?: string;

  /** The display name. */
  readonly name: string;

  /**
   * The icon.
   *
   * A 16×16 SVG document that renders in `currentColor` provided by the theme.
   */
  readonly icon?: string;

  /**
   * Returns the process to start for a session.
   *
   * Throwing an error stops the session with that error.
   */
  start(session: AgentSession): AgentProcess | Promise<AgentProcess>;
}

/** The session an agent is started for. */
export interface AgentSession {
  /** The absolute native path of the workspace the agent works in. */
  readonly workspaceNativePath: string;
}

/** The process an agent runs as. */
export interface AgentProcess {
  /** The program to run. */
  readonly program: string;

  /** The arguments. */
  readonly args?: readonly string[];

  /** Environment variables. */
  readonly env?: Readonly<Record<string, string>>;
}
