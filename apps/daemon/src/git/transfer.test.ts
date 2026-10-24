import { Code, TransportError } from '@elsewise/transport';
import { expect, test, vi } from 'vitest';
import { Progress_Phase as Phase } from '../gen/elsewise/daemon/git/v1/git_pb';
import type { ProgressInit } from './commands/progress';
import { GitError } from './error';
import type { Git, RunOptions } from './git';
import { transfer } from './transfer';

function gitRunner(lines: string[], outcome: 'ok' | 'fail' | 'cancel'): Git & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (_args: string[], options: RunOptions) => {
    for (const line of lines) {
      await Promise.resolve(); // Continues on the following microtask.
      options.onStderr?.(Buffer.from(`${line}\n`));
    }
    if (outcome === 'fail') {
      throw new GitError(128, 'fatal: could not read from remote\n', '');
    }
    if (outcome === 'cancel') {
      throw new TransportError(Code.CANCELLED, 'the call was cancelled');
    }
    return Buffer.alloc(0);
  });
  return { run } as unknown as Git & { run: typeof run };
}

function drain(git: Git, signal = new AbortController().signal) {
  const seen: ProgressInit[] = [];
  const ended = (async () => {
    for await (const progress of transfer(git, ['fetch', '--progress'], signal)) {
      seen.push(progress);
    }
  })();
  return { seen, ended };
}

test('yields the progress in order and ends when the transfer succeeds', async () => {
  const git = gitRunner(
    ['Receiving objects:  50% (1/2)', 'Receiving objects: 100% (2/2), done.', 'Resolving deltas: 100% (1/1)'],
    'ok',
  );
  const signal = new AbortController().signal;

  const { seen, ended } = drain(git, signal);
  await ended;

  expect(seen).toEqual([
    { phase: Phase.RECEIVING, percent: 50 },
    { phase: Phase.RECEIVING, percent: 100 },
    { phase: Phase.RESOLVING, percent: 100 },
  ]);
  expect(git.run).toHaveBeenCalledWith(['fetch', '--progress'], expect.objectContaining({ signal }));
});

test('throws the failure', async () => {
  const { seen, ended } = drain(gitRunner(['Counting objects: 100% (3/3)'], 'fail'));

  await expect(ended).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION, message: 'could not read from remote' });
  expect(seen).toEqual([{ phase: Phase.COUNTING, percent: 100 }]);
});

test('throws a cancellation', async () => {
  const { seen, ended } = drain(gitRunner([], 'cancel'));

  await expect(ended).rejects.toMatchObject({ code: Code.CANCELLED });
  expect(seen).toEqual([]);
});
