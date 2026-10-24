import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { Change, Status_Entry_Conflicted_Kind as Kind } from '../../gen/elsewise/daemon/git/v1/git_pb';
import { hasConflicts, parseStatus, readOperation, readStatus } from './status';

const NUL = '\0';

let repo: TestRepo;

beforeEach(async () => {
  repo = await TestRepo.create();
});

afterEach(() => repo.remove());

/** Writes a file in the git directory. */
async function createGitFile(relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(repo.nativeRoot, '.git', relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}

describe('readStatus', () => {
  test('returns the status with or without the ignored entries', async () => {
    await repo.commit('.gitignore', 'ignored.txt\n');
    await repo.write('ignored.txt', 'I');
    await repo.write('new.txt', 'N');

    await expect(readStatus(repo.git, false)).resolves.toEqual({
      branch: 'main',
      hash: await repo.run('rev-parse', 'HEAD'),
      upstream: '',
      upstreamGone: false,
      ahead: 0,
      behind: 0,
      entries: [{ relativePath: 'new.txt', kind: { case: 'untracked', value: {} } }],
      operation: undefined,
    });
    const { entries } = await readStatus(repo.git, true);
    expect(entries?.map((entry) => entry.relativePath)).toEqual(['new.txt', 'ignored.txt']);
  });
});

describe('parseStatus', () => {
  test('parses the branch headers', () => {
    const text = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1'].join(
      NUL,
    );
    expect(parseStatus(text)).toEqual({
      branch: 'main',
      hash: 'abc',
      upstream: 'origin/main',
      upstreamGone: false,
      ahead: 2,
      behind: 1,
      entries: [],
    });
  });

  test('reports an unborn branch, a detached head and a gone upstream', () => {
    expect(parseStatus(['# branch.oid (initial)', '# branch.head main'].join(NUL))).toMatchObject({
      hash: '',
      branch: 'main',
    });
    const gone = ['# branch.oid abc', '# branch.head (detached)', '# branch.upstream origin/old'].join(NUL);
    expect(parseStatus(gone)).toMatchObject({
      branch: '',
      upstream: 'origin/old',
      upstreamGone: true,
      ahead: 0,
      behind: 0,
    });
  });

  test('parses every kind of entry', () => {
    const text = [
      '# branch.oid abc',
      '# branch.head main',
      '1 .M N... 100644 100644 100644 78981 78981 a b.txt',
      '1 A. N... 000000 100644 100644 00000 61780 added.txt',
      '2 R. N... 100644 100644 100644 61780 61780 R100 d/c.txt',
      'd/b.txt',
      'u UU N... 100644 100644 100644 100644 00000 11111 22222 conflict.txt',
      'u DU N... 100644 100644 100644 100644 00000 11111 22222 deleted-by-us.txt',
      '? new.txt',
      '! node_modules/',
    ].join(NUL);
    expect(parseStatus(text).entries).toEqual([
      {
        relativePath: 'a b.txt',
        kind: {
          case: 'changed',
          value: { staged: Change.UNSPECIFIED, unstaged: Change.MODIFIED, originalRelativePath: '' },
        },
      },
      {
        relativePath: 'added.txt',
        kind: {
          case: 'changed',
          value: { staged: Change.ADDED, unstaged: Change.UNSPECIFIED, originalRelativePath: '' },
        },
      },
      {
        relativePath: 'd/c.txt',
        kind: {
          case: 'changed',
          value: { staged: Change.RENAMED, unstaged: Change.UNSPECIFIED, originalRelativePath: 'd/b.txt' },
        },
      },
      { relativePath: 'conflict.txt', kind: { case: 'conflicted', value: { kind: Kind.BOTH_MODIFIED } } },
      { relativePath: 'deleted-by-us.txt', kind: { case: 'conflicted', value: { kind: Kind.DELETED_BY_US } } },
      { relativePath: 'new.txt', kind: { case: 'untracked', value: {} } },
      { relativePath: 'node_modules', kind: { case: 'ignored', value: {} } },
    ]);
  });

  test('maps every change letter and skips malformed records', () => {
    const text = [
      '# branch.oid abc',
      '1 D. N... 100644 000000 000000 78981 00000 gone.txt',
      '1 .T N... 100644 100644 120000 78981 78981 link',
      '2 C. N... 100644 100644 100644 61780 61780 C100 copy.txt',
      'orig.txt',
      'u DD N... 100644 100644 100644 100644 00000 11111 22222 dd.txt',
      'u AU N... 100644 100644 100644 100644 00000 11111 22222 au.txt',
      'u UD N... 100644 100644 100644 100644 00000 11111 22222 ud.txt',
      'u UA N... 100644 100644 100644 100644 00000 11111 22222 ua.txt',
      'u AA N... 100644 100644 100644 100644 00000 11111 22222 aa.txt',
      'u XY N... 100644 100644 100644 100644 00000 11111 22222 xy.txt',
      '1 malformed',
      'x unknown',
    ].join(NUL);
    expect(parseStatus(text).entries).toEqual([
      {
        relativePath: 'gone.txt',
        kind: {
          case: 'changed',
          value: { staged: Change.DELETED, unstaged: Change.UNSPECIFIED, originalRelativePath: '' },
        },
      },
      {
        relativePath: 'link',
        kind: {
          case: 'changed',
          value: { staged: Change.UNSPECIFIED, unstaged: Change.OTHER, originalRelativePath: '' },
        },
      },
      {
        relativePath: 'copy.txt',
        kind: {
          case: 'changed',
          value: { staged: Change.COPIED, unstaged: Change.UNSPECIFIED, originalRelativePath: 'orig.txt' },
        },
      },
      { relativePath: 'dd.txt', kind: { case: 'conflicted', value: { kind: Kind.BOTH_DELETED } } },
      { relativePath: 'au.txt', kind: { case: 'conflicted', value: { kind: Kind.ADDED_BY_US } } },
      { relativePath: 'ud.txt', kind: { case: 'conflicted', value: { kind: Kind.DELETED_BY_THEM } } },
      { relativePath: 'ua.txt', kind: { case: 'conflicted', value: { kind: Kind.ADDED_BY_THEM } } },
      { relativePath: 'aa.txt', kind: { case: 'conflicted', value: { kind: Kind.BOTH_ADDED } } },
      { relativePath: 'xy.txt', kind: { case: 'conflicted', value: { kind: Kind.OTHER } } },
    ]);
  });
});

describe('readOperation', () => {
  test('returns no operation in an empty repository', async () => {
    await expect(readOperation(repo.git)).resolves.toBeUndefined();
  });

  test('returns an interactive rebase and hides a merge', async () => {
    await createGitFile('rebase-merge/msgnum', '2\n');
    await createGitFile('rebase-merge/end', '3\n');
    await createGitFile('rebase-merge/stopped-sha', 'abc\n');
    await createGitFile('MERGE_HEAD', 'def\n');
    await expect(readOperation(repo.git)).resolves.toEqual({
      case: 'rebase',
      value: { step: 2, total: 3, hash: 'abc' },
    });
  });

  test('returns a rebase that applies patches', async () => {
    await createGitFile('rebase-apply/next', '1\n');
    await createGitFile('rebase-apply/last', 'x\n');
    await expect(readOperation(repo.git)).resolves.toEqual({
      case: 'rebase',
      value: { step: 1, total: 0, hash: '' },
    });
  });

  test('returns a merge of several heads', async () => {
    await createGitFile('MERGE_HEAD', 'abc\ndef\n');
    await expect(readOperation(repo.git)).resolves.toEqual({ case: 'merge', value: { hashes: ['abc', 'def'] } });
  });

  test('returns a cherry-pick, a revert and a bisection', async () => {
    await createGitFile('CHERRY_PICK_HEAD', 'abc\n');
    await expect(readOperation(repo.git)).resolves.toEqual({ case: 'cherryPick', value: { hash: 'abc' } });
    await fs.rm(path.join(repo.nativeRoot, '.git', 'CHERRY_PICK_HEAD'));
    await createGitFile('REVERT_HEAD', 'def\n');
    await expect(readOperation(repo.git)).resolves.toEqual({ case: 'revert', value: { hash: 'def' } });
    await fs.rm(path.join(repo.nativeRoot, '.git', 'REVERT_HEAD'));
    await createGitFile('BISECT_LOG', '');
    await expect(readOperation(repo.git)).resolves.toEqual({ case: 'other', value: {} });
  });
});

describe('hasConflicts', () => {
  test('tells whether any staged entry is unmerged', async () => {
    await repo.commit('a.txt', 'A');
    await repo.run('checkout', '--quiet', '-b', 'other');
    await repo.commit('a.txt', 'B');
    await repo.run('checkout', '--quiet', 'main');
    await repo.commit('a.txt', 'C');
    await expect(hasConflicts(repo.git)).resolves.toBe(false);

    await repo.run('merge', 'other').catch(() => {});
    await expect(hasConflicts(repo.git)).resolves.toBe(true);
  });
});
