import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { toProtocolPath } from '../../fs/path';
import { parseWorktrees, readWorktree, readWorktrees } from './worktree';

let repo: TestRepo;
let hash: string;
let linked: string;
let link: string;

beforeEach(async () => {
  repo = await TestRepo.create();
  hash = await repo.commit('a.txt', 'A');
  linked = path.join(path.dirname(repo.nativeRoot), 'linked');
  await repo.run('worktree', 'add', '--quiet', linked, '-b', 'linked');
  link = path.join(path.dirname(repo.nativeRoot), 'link');
  await fs.symlink(linked, link);
});

afterEach(() => repo.remove());

describe('readWorktrees', () => {
  test('returns the worktrees', async () => {
    await expect(readWorktrees(repo.git)).resolves.toEqual([
      {
        absolutePath: toProtocolPath(repo.nativeRoot),
        branch: 'main',
        hash,
        main: true,
        locked: false,
        lockReason: '',
        prunable: false,
      },
      {
        absolutePath: toProtocolPath(linked),
        branch: 'linked',
        hash,
        main: false,
        locked: false,
        lockReason: '',
        prunable: false,
      },
    ]);
  });
});

describe('readWorktree', () => {
  test('returns the worktree', async () => {
    await expect(readWorktree(repo.git, link)).resolves.toMatchObject({ branch: 'linked' });
    await expect(readWorktree(repo.git, path.dirname(repo.nativeRoot))).rejects.toThrow('is not a worktree');
  });
});

describe('parseWorktrees', () => {
  test('parses the main, locked and prunable worktrees', () => {
    const text = [
      'worktree /r\0HEAD abc\0branch refs/heads/main\0',
      'worktree /wt\0HEAD abc\0branch refs/heads/feat\0locked why not\0',
      'worktree /gone\0HEAD abc\0detached\0prunable gitdir file points to non-existent location\0',
      'worktree /new\0HEAD 0000000000000000000000000000000000000000\0branch refs/heads/x\0',
    ].join('\0');
    expect(parseWorktrees(`${text}\0`)).toEqual([
      { absolutePath: '/r', branch: 'main', hash: 'abc', main: true, locked: false, lockReason: '', prunable: false },
      {
        absolutePath: '/wt',
        branch: 'feat',
        hash: 'abc',
        main: false,
        locked: true,
        lockReason: 'why not',
        prunable: false,
      },
      { absolutePath: '/gone', branch: '', hash: 'abc', main: false, locked: false, lockReason: '', prunable: true },
      { absolutePath: '/new', branch: 'x', hash: '', main: false, locked: false, lockReason: '', prunable: false },
    ]);
  });
});
