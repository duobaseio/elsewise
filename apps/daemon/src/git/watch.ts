import path from 'node:path';
import type { DirectoryWatcher } from '../directory-watcher';
import type { StatusInit } from './commands/status';
import type { Git } from './git';

export interface WatchStatusOptions {
  /** The `DirectoryWatcher`. */
  watcher: DirectoryWatcher;

  /** How often the status is polled in milliseconds. */
  pollIntervalMs: number;

  /** How long notified changes are debounced in milliseconds. */
  debounceMs: number;

  /** Reads the status. */
  read(): Promise<StatusInit>;
}

/** Yields the status whenever it changes. */
export async function* watchStatus(
  git: Git,
  signal: AbortSignal,
  options: WatchStatusOptions,
): AsyncGenerator<StatusInit> {
  let dirty = true;
  let wake: (() => void) | undefined;
  let debounce: NodeJS.Timeout | undefined;
  const mark = () => {
    dirty = true;
    wake?.();
  };
  const notified = () => {
    debounce ??= setTimeout(() => {
      debounce = undefined;
      mark();
    }, options.debounceMs);
  };

  const subscriptions = (await watchedDirectories(git)).map((root) => options.watcher.watch(root, notified));
  const poll = setInterval(mark, options.pollIntervalMs);
  signal.addEventListener('abort', mark, { once: true });

  let last: string | undefined;
  try {
    while (!signal.aborted) {
      if (dirty) {
        dirty = false;
        const status = await options.read();
        if (signal.aborted) {
          break;
        }
        const key = JSON.stringify(status);
        if (key !== last) {
          last = key;
          yield status;
        }
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  } finally {
    signal.removeEventListener('abort', mark);
    clearInterval(poll);
    clearTimeout(debounce);
    for (const subscription of subscriptions) {
      subscription.close();
    }
  }
}

/** Returns the git root and the main git directory (for a linked worktree). */
async function watchedDirectories(git: Git): Promise<string[]> {
  const gitDir = (await git.text(['rev-parse', '--path-format=absolute', '--git-dir'])).trim();
  const relative = path.relative(git.root, gitDir);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return inside ? [git.root] : [git.root, gitDir];
}
