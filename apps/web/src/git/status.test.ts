import { create, type MessageInitShape } from '@bufbuild/protobuf';
import type { FileTreeGitStatus } from '@elsewise/components/components/file-tree';
import { describe, expect, test } from 'vitest';
import { Change, Status_Entry_Conflicted_Kind, StatusSchema } from '@/gen/elsewise/daemon/git/v1/git_pb';
import { type WatchStatusResponse, WatchStatusResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { watchGitStatus } from './status';

// Watches a status stream that sends `responses` and then stays open until stopped.
function watch(responses: WatchStatusResponse[]) {
  const applied: (readonly FileTreeGitStatus[])[] = [];
  let signal: AbortSignal | undefined;
  const stop = watchGitStatus(
    {
      watchStatus: (_, options) => {
        signal = options?.signal;
        return (async function* () {
          yield* responses;
          await new Promise((resolve) => signal?.addEventListener('abort', resolve));
        })();
      },
    },
    '/repo',
    { setGitStatus: (statuses) => applied.push(statuses) },
  );
  return { applied, stop, aborted: () => signal?.aborted };
}

function status(entries: MessageInitShape<typeof StatusSchema>['entries']) {
  return create(WatchStatusResponseSchema, { status: create(StatusSchema, { entries }) });
}

describe('watchGitStatus', () => {
  test('marks each kind of entry', async () => {
    const { applied } = watch([
      status([
        { relativePath: 'a.ts', kind: { case: 'changed', value: { unstaged: Change.MODIFIED } } },
        { relativePath: 'b.ts', kind: { case: 'changed', value: { staged: Change.ADDED } } },
        { relativePath: 'c.ts', kind: { case: 'untracked', value: {} } },
        { relativePath: 'nested', kind: { case: 'untracked', value: {} }, directory: true },
        { relativePath: 'dist', kind: { case: 'ignored', value: {} }, directory: true },
        { relativePath: '.env', kind: { case: 'ignored', value: {} } },
        {
          relativePath: 'd.ts',
          kind: { case: 'conflicted', value: { kind: Status_Entry_Conflicted_Kind.BOTH_MODIFIED } },
        },
      ]),
    ]);

    await expect
      .poll(() => applied)
      .toEqual([
        [
          { path: 'a.ts', status: 'modified' },
          { path: 'b.ts', status: 'added' },
          { path: 'c.ts', status: 'untracked' },
          { path: 'nested/', status: 'untracked' },
          { path: 'dist/', status: 'ignored' },
          { path: '.env', status: 'ignored' },
          { path: 'd.ts', status: 'conflict' },
        ],
      ]);
  });

  test('replaces statuses on each response', async () => {
    const { applied } = watch([status([{ relativePath: 'a.ts', kind: { case: 'untracked', value: {} } }]), status([])]);

    await expect.poll(() => applied).toEqual([[{ path: 'a.ts', status: 'untracked' }], []]);
  });

  test('stops stream', () => {
    const { stop, aborted } = watch([]);

    stop();

    expect(aborted()).toBe(true);
  });
});
