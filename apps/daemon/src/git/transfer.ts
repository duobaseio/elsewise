import { type ProgressInit, ProgressParser } from './commands/progress';
import { attempt } from './error';
import type { Git } from './git';

/** Runs a transfer and yields its progress. */
export async function* transfer(git: Git, args: string[], signal: AbortSignal): AsyncGenerator<ProgressInit> {
  const queue: ProgressInit[] = [];
  let wake: (() => void) | undefined;
  let done = false;

  const parser = new ProgressParser((progress) => {
    queue.push(progress);
    wake?.();
  });
  const running = git.run(args, { signal, onStderr: (chunk) => parser.push(chunk) });
  const settled = () => {
    done = true;
    wake?.();
  };
  void running.then(settled, settled);

  while (true) {
    const next = queue.shift();
    if (next) {
      yield next;
      continue;
    }
    if (done) {
      break;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
    wake = undefined;
  }
  await attempt(() => running);
}
