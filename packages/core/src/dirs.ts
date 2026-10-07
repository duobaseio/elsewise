import os from 'node:os';
import path from 'node:path';

const ORGANIZATION = 'duobase';
const APPLICATION = 'elsewise';

/**
 * Returns the directory where the user-facing settings and configuration live.
 */
export function configLocalDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(localAppData(), ORGANIZATION, APPLICATION, 'config');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', `io.${ORGANIZATION}.${APPLICATION}`, 'config');
    default:
      return path.join(xdg('XDG_CONFIG_HOME', '.config'), APPLICATION);
  }
}

/**
 * Returns the directory where the application's state lives, next to the host's database and worktrees.
 */
export function dataLocalDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(localAppData(), ORGANIZATION, APPLICATION, 'data');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', `io.${ORGANIZATION}.${APPLICATION}`, 'data');
    default:
      return path.join(xdg('XDG_DATA_HOME', '.local/share'), APPLICATION);
  }
}

function localAppData(): string {
  const local = process.env.LOCALAPPDATA;
  return local ? local : path.join(os.homedir(), 'AppData', 'Local');
}

function xdg(variable: string, fallback: string): string {
  const home = process.env[variable];
  return home && path.isAbsolute(home) ? home : path.join(os.homedir(), fallback);
}
