import { create } from '@bufbuild/protobuf';
import type { Workspace } from '@elsewise/frontend-plugin';
import { describe, expect, test, vi } from 'vitest';
import { type Daemon, LOCAL_DAEMON_ID } from '@/daemon';
import {
  CopyEntriesResponseSchema,
  MoveEntriesResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { MoveResponse_Failure_Reason, MoveResponseSchema } from '@/gen/elsewise/daemon/git/v1/git_service_pb';
import { pasteEntries } from './paste';

const WORKSPACE: Workspace = {
  id: { daemon: LOCAL_DAEMON_ID, project: 'elsewise', workspace: 'singapore' },
  name: 'Singapore',
  state: 'ok',
  main: false,
  absolutePath: '/elsewise',
};

const ENTRIES = [
  { source: 'a.ts', destination: 'src/a.ts', folder: false },
  { source: 'b.ts', destination: 'src/b.ts', folder: false },
  { source: 'lib', destination: 'src/lib', folder: true },
];

const REQUEST = {
  entries: [
    { relativePath: 'a.ts', newRelativePath: 'src/a.ts' },
    { relativePath: 'b.ts', newRelativePath: 'src/b.ts' },
    { relativePath: 'lib', newRelativePath: 'src/lib' },
  ],
};

describe('pasteEntries', () => {
  test('moves through git in one request', async () => {
    const move = vi.fn<Daemon['git']['move']>(async () =>
      create(MoveResponseSchema, {
        failures: [
          { relativePath: 'a.ts', reason: MoveResponse_Failure_Reason.ALREADY_EXISTS, message: 'exists' },
          { relativePath: 'b.ts', reason: MoveResponse_Failure_Reason.OTHER, message: 'denied' },
        ],
      }),
    );

    const result = await pasteEntries({ git: { move } } as unknown as Daemon, WORKSPACE, true, ENTRIES, false);

    expect(move.mock.calls).toEqual([[{ absolutePath: '/elsewise', ...REQUEST, overwrite: false }]]);
    expect(result).toEqual({
      conflicting: [ENTRIES[0]],
      failures: [{ entry: ENTRIES[1], error: new Error('denied') }],
    });
  });

  test('moves outside git', async () => {
    const moveEntries = vi.fn<Daemon['fileSystem']['moveEntries']>(async () => create(MoveEntriesResponseSchema));
    const daemon = { fileSystem: { moveEntries } } as unknown as Daemon;

    const result = await pasteEntries(daemon, { ...WORKSPACE, state: 'broken' }, true, ENTRIES, true);

    expect(moveEntries.mock.calls).toEqual([[{ root: '/elsewise', ...REQUEST, overwrite: true }]]);
    expect(result).toEqual({ conflicting: [], failures: [] });
  });

  test('copies', async () => {
    const copyEntries = vi.fn<Daemon['fileSystem']['copyEntries']>(async () => create(CopyEntriesResponseSchema));
    const daemon = { fileSystem: { copyEntries } } as unknown as Daemon;

    await pasteEntries(daemon, WORKSPACE, false, ENTRIES, false);

    expect(copyEntries.mock.calls).toEqual([[{ root: '/elsewise', ...REQUEST, overwrite: false }]]);
  });
});
