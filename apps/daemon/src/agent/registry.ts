import type { Agent, Disposable, McpServer } from '@elsewise/daemon-plugin';
import { Registry } from '../plugins/registry';

/**
 * The agents plugins have added.
 */
export class AgentRegistry extends Registry<Agent> {
  constructor() {
    super(
      (id) => `Agent ${id} has already been added.`,
      (agent) => agent.name,
    );
  }

  /**
   * Adds the agent of the plugin `pluginId` (e.g. @scope/name).
   *
   * Throws an error if the plugin has added an agent with the same id.
   */
  addFrom(pluginId: string, agent: Agent): Disposable {
    return this.add(agent.id === undefined ? pluginId : `${pluginId}/${agent.id}`, agent);
  }
}

/**
 * The Model Context Protocol servers plugins have added.
 */
export class McpServerRegistry extends Registry<McpServer> {
  constructor() {
    super(
      (name) => `MCP server ${name} has already been added.`,
      (server) => server.name,
    );
  }
}
