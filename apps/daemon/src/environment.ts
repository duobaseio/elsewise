import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { execa } from 'execa';

type Environment = Record<string, string | undefined>;

/**
 * The variables a shell sets for itself which should be excluded from the user's environment.
 */
const SHELL_OWNED = new Set(['_', 'SHLVL', 'PWD', 'OLDPWD']);

/**
 * Returns the environment the user's login shell uses.
 *
 * A daemon started outside a terminal (e.g. from Finder or desktop launcher) inherits a bare `PATH`. This method finds
 * what the path installed on the user's default shell.
 *
 * Windows has no shell start-up files (e.g. `.zshrc`) and hence returns nothing.
 */
export async function loginEnvironment(
  shell = process.env.SHELL || '/bin/sh',
  timeoutMs = 10_000,
): Promise<Record<string, string>> {
  if (process.platform === 'win32') {
    return {};
  }

  // The markers separate the environment from whatever the start-up files print.
  const marker = randomUUID();
  const subprocess = execa(shell, ['-ilc', `printf %s ${marker}; command env -0; printf %s ${marker}`], {
    env: { DISABLE_AUTO_UPDATE: 'true' }, // Auto update could mess with the shell output.
    stdin: 'ignore',
    stderr: 'ignore',
    timeout: timeoutMs,
    killSignal: 'SIGKILL', // An interactive shell ignores SIGTERM.
    buffer: false,
    reject: false,
  });
  const printed = await readBetween(subprocess.stdout, marker, timeoutMs);
  if (!printed) {
    const result = await subprocess;
    console.error(`${shell}: the login shell's environment could not be read:`, result.shortMessage ?? 'no output');
    return {};
  }

  const environment: Record<string, string> = {};
  for (const variable of printed.split('\0')) {
    const separator = variable.indexOf('=');
    const name = variable.slice(0, separator);
    // DISABLE_AUTO_UPDATE is set for this shell so it should not be saved.
    if (separator > 0 && !SHELL_OWNED.has(name) && name !== 'DISABLE_AUTO_UPDATE') {
      environment[name] = variable.slice(separator + 1);
    }
  }
  return environment;
}

/**
 * Merges the environments with a later one taking precedence.
 */
export function mergeEnvironment(layers: Environment[]): Record<string, string> {
  const merged: Record<string, string> = {};
  const names = new Map<string, string>();
  for (const layer of layers) {
    for (const [name, value] of Object.entries(layer)) {
      if (value === undefined) {
        continue;
      }
      // As Windows environment variable names are not case-sensitive, we need to compare it in the same case.
      const key = process.platform === 'win32' ? name.toUpperCase() : name;
      const previous = names.get(key);
      if (previous !== undefined && previous !== name) {
        delete merged[previous];
      }
      names.set(key, name);
      merged[name] = value;
    }
  }
  return merged;
}

/**
 * Returns the environment's `PATH` value.
 *
 * As Windows environment variable names are not case-sensitive, this method scans through every environment variable
 * for the path.
 */
export function pathOf(environment: Environment): string | undefined {
  if (process.platform !== 'win32') {
    return environment.PATH;
  }
  return Object.entries(environment).find(([name]) => name.toUpperCase() === 'PATH')?.[1];
}

/**
 * Returns what the stream carries between two markers.
 */
function readBetween(stream: Readable, marker: string, timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let output = '';
    const finish = (printed?: string) => {
      clearTimeout(timer);
      stream.destroy();
      resolve(printed);
    };
    const timer = setTimeout(finish, timeoutMs);
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      output += chunk;
      const [, printed, end] = output.split(marker);
      if (end !== undefined) {
        finish(printed);
      }
    });
    stream.on('error', () => finish());
    stream.on('close', () => finish());
  });
}
