import type { Agent } from '@elsewise/daemon-plugin';
import { describe, expect, test } from 'vitest';
import { AgentRegistry } from './registry';

function agent(name: string, id?: string): Agent {
  return { id, name, start: () => ({ program: name }) };
}

describe('AgentRegistry', () => {
  test("adds an agent without an id under its plugin's id", () => {
    const registry = new AgentRegistry();
    const ant = agent('Ant');

    registry.addFrom('@scope/name', ant);

    expect(registry.get('@scope/name')).toBe(ant);
  });

  test("adds an agent with an id under its plugin's id followed by its own", () => {
    const registry = new AgentRegistry();
    const bee = agent('Bee', 'bee');

    registry.addFrom('@scope/name', bee);

    expect(registry.get('@scope/name/bee')).toBe(bee);
  });

  test('refuses a second agent with the same id from a plugin', () => {
    const registry = new AgentRegistry();
    registry.addFrom('@scope/name', agent('Ant'));
    registry.addFrom('@scope/name', agent('Bee', 'bee'));

    expect(() => registry.addFrom('@scope/name', agent('Other'))).toThrow('Agent @scope/name has already been added.');
    expect(() => registry.addFrom('@scope/name', agent('Other', 'bee'))).toThrow(
      'Agent @scope/name/bee has already been added.',
    );
  });
});
