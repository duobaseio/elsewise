import { Command } from 'commander';
import manifest from '../package.json' with { type: 'json' };
import { registerHello } from './commands/hello';

/**
 * Builds the `elsewise` command with every subcommand registered.
 */
export function createProgram(): Command {
  const program = new Command('elsewise').description(manifest.description).version(manifest.version);

  registerHello(program);

  return program;
}
