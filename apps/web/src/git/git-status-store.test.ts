import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { describe, expect, test, vi } from 'vitest';
import { Change, Status_Entry_Conflicted_Type, StatusSchema } from '@/gen/elsewise/daemon/git/v1/git_pb';
import { type WatchStatusResponse, WatchStatusResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { GitStatusStore } from './git-status-store';

const SINGAPORE = { daemon: 'local', project: 'elsewise', workspace: 'singapore' };
const TOKYO = { daemon: 'local', project: 'elsewise', workspace: 'tokyo' };

// Watches a status stream of `workspace` that sends `responses` and then stays open until stopped.
function watch(store: GitStatusStore, responses: WatchStatusResponse[], workspace = SINGAPORE) {
  let signal: AbortSignal | undefined;
  const stop = store.watch(
    {
      watchStatus: (_, options) => {
        signal = options?.signal;
        return (async function* () {
          yield* responses;
          await new Promise((resolve) => signal?.addEventListener('abort', resolve));
        })();
      },
    },
    workspace,
    '/repo',
  );
  return { stop, aborted: () => signal?.aborted };
}

function status(entries: MessageInitShape<typeof StatusSchema>['entries']) {
  return create(WatchStatusResponseSchema, { status: create(StatusSchema, { entries }) });
}

describe('watch', () => {
  test('marks each kind of entry', async () => {
    const store = new GitStatusStore();
    watch(store, [
      status([
        { relativePath: 'a.ts', kind: { case: 'changed', value: { unstaged: Change.MODIFIED } } },
        { relativePath: 'b.ts', kind: { case: 'changed', value: { staged: Change.ADDED } } },
        { relativePath: 'c.ts', kind: { case: 'untracked', value: {} } },
        { relativePath: 'nested', kind: { case: 'untracked', value: {} }, directory: true },
        { relativePath: 'dist', kind: { case: 'ignored', value: {} }, directory: true },
        { relativePath: '.env', kind: { case: 'ignored', value: {} } },
        {
          relativePath: 'd.ts',
          kind: { case: 'conflicted', value: { type: Status_Entry_Conflicted_Type.BOTH_MODIFIED } },
        },
      ]),
    ]);

    await expect
      .poll(() => store.list(SINGAPORE))
      .toEqual([
        { path: 'a.ts', status: 'modified' },
        { path: 'b.ts', status: 'added' },
        { path: 'c.ts', status: 'untracked' },
        { path: 'nested/', status: 'untracked' },
        { path: 'dist/', status: 'ignored' },
        { path: '.env', status: 'ignored' },
        { path: 'd.ts', status: 'conflict' },
      ]);
    expect(store.get(SINGAPORE, 'b.ts')).toBe('added');
    expect(store.get(SINGAPORE, 'nested/')).toBe('untracked');
    expect(store.get(SINGAPORE, 'e.ts')).toBeNull();
  });

  test('replaces statuses on each response', async () => {
    const store = new GitStatusStore();
    const lists: unknown[] = [];
    store.onChange(() => lists.push(store.list(SINGAPORE)));

    watch(store, [status([{ relativePath: 'a.ts', kind: { case: 'untracked', value: {} } }]), status([])]);

    await expect.poll(() => lists).toEqual([[{ path: 'a.ts', status: 'untracked' }], []]);
    expect(store.get(SINGAPORE, 'a.ts')).toBeNull();
  });

  test('keeps workspaces apart', async () => {
    const store = new GitStatusStore();

    watch(store, [status([{ relativePath: 'a.ts', kind: { case: 'untracked', value: {} } }])]);
    watch(store, [status([])], TOKYO);

    await expect.poll(() => store.get(SINGAPORE, 'a.ts')).toBe('untracked');
    expect(store.get(TOKYO, 'a.ts')).toBeNull();
  });

  test('stops stream and forgets statuses', async () => {
    const store = new GitStatusStore();
    const { stop, aborted } = watch(store, [
      status([{ relativePath: 'a.ts', kind: { case: 'untracked', value: {} } }]),
    ]);
    await expect.poll(() => store.get(SINGAPORE, 'a.ts')).toBe('untracked');
    const listener = vi.fn();
    store.onChange(listener);

    stop();

    expect(aborted()).toBe(true);
    expect(store.list(SINGAPORE)).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
  });
});
