import { cancel, isCancel, text } from '@clack/prompts';
import { type Command, InvalidArgumentError } from 'commander';
import * as z from 'zod';

// TODO: Remove once the CLI has a real command.

const Name = z.string().trim().min(1, 'A name cannot be empty.');

/**
 * Registers `hello`.
 */
export function registerHello(program: Command): void {
  program
    .command('hello')
    .description('Greet someone.')
    .argument('[name]', 'who to greet', parseName)
    .action(async (name?: string) => {
      process.stdout.write(`Hello, ${name ?? (await askName())}!\n`);
    });
}

function parseName(value: string): string {
  const parsed = Name.safeParse(value);
  if (!parsed.success) {
    throw new InvalidArgumentError(z.prettifyError(parsed.error));
  }
  return parsed.data;
}

async function askName(): Promise<string> {
  const name = await text({
    message: 'Who should be greeted?',
    validate: (value) => Name.safeParse(value).error?.issues[0]?.message,
  });
  if (isCancel(name)) {
    cancel('Cancelled.');
    process.exit(1);
  }
  return Name.parse(name);
}
