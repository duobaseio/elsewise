import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { Change } from '../../gen/elsewise/daemon/git/v1/git_pb';
import { parseCommits, parseNameStatus, readChangedEntries, readCommit, readLog, readMergeBase } from './commit';

const US = '\x1f';

let repo: TestRepo;
let first: string;
let second: string;

beforeEach(async () => {
  repo = await TestRepo.create();
  first = await repo.commit('a.txt', 'A', 'first');
  second = await repo.commit('b.txt', 'B', 'second\n\nbody');
});

afterEach(() => repo.remove());

describe('readCommit', () => {
  test('returns a commit, and refuses a revision that is not one', async () => {
    await expect(readCommit(repo.git, 'HEAD')).resolves.toMatchObject({
      hash: second,
      parentHashes: [first],
      message: 'second\n\nbody',
    });
    await expect(readCommit(repo.git, 'HEAD~')).resolves.toMatchObject({
      hash: first,
      parentHashes: [],
      message: 'first',
      author: { name: 'Test', email: 'test@example.com' },
    });
    await expect(readCommit(repo.git, `${first}^{tree}`)).rejects.toThrow('is not a commit');
  });
});

describe('readLog', () => {
  test('returns the history of HEAD or revisions', async () => {
    const hashes = async (revisions: string[], pathspecs: string[], skip: number, limit: number) =>
      (await readLog(repo.git, revisions, pathspecs, skip, limit)).map((commit) => commit.hash);
    await expect(hashes([], [], 0, 10)).resolves.toEqual([second, first]);
    await expect(hashes([], [], 1, 10)).resolves.toEqual([first]);
    await expect(hashes([], [], 0, 1)).resolves.toEqual([second]);
    await expect(hashes(['HEAD~'], [], 0, 10)).resolves.toEqual([first]);
    await expect(hashes([], [':(literal)b.txt'], 0, 10)).resolves.toEqual([second]);
  });
});

describe('readMergeBase', () => {
  test('returns the common ancestor and nothing for unrelated histories', async () => {
    await repo.run('switch', '--quiet', '--create', 'feature', first);
    const feature = await repo.commit('c.txt', 'C', 'feature');
    await repo.run('switch', '--quiet', '--orphan', 'unrelated');
    const unrelated = await repo.commit('d.txt', 'D', 'unrelated');
    await repo.run('switch', '--quiet', 'main');

    await expect(readMergeBase(repo.git, 'main', 'feature')).resolves.toBe(first);
    await expect(readMergeBase(repo.git, feature, second)).resolves.toBe(first);
    await expect(readMergeBase(repo.git, 'HEAD', 'HEAD~')).resolves.toBe(first);
    await expect(readMergeBase(repo.git, 'main', unrelated)).resolves.toBe('');
    await expect(readMergeBase(repo.git, 'main', 'nope')).rejects.toThrow();
  });
});

describe('parseCommits', () => {
  test('parses commits', () => {
    const record = ['h1', 'p1 p2', 'Ann', 'ann@e.com', '100', 'Cal', 'cal@e.com', '200', 'subject\n\nbody\n'].join(US);
    const root = ['h0', '', 'Ann', 'ann@e.com', '100', 'Ann', 'ann@e.com', '100', 'first\n'].join(US);
    expect(parseCommits(`${record}\0${root}\0`)).toEqual([
      {
        hash: 'h1',
        parentHashes: ['p1', 'p2'],
        author: { name: 'Ann', email: 'ann@e.com', time: timestampFromMs(100_000) },
        committer: { name: 'Cal', email: 'cal@e.com', time: timestampFromMs(200_000) },
        message: 'subject\n\nbody',
      },
      {
        hash: 'h0',
        parentHashes: [],
        author: { name: 'Ann', email: 'ann@e.com', time: timestampFromMs(100_000) },
        committer: { name: 'Ann', email: 'ann@e.com', time: timestampFromMs(100_000) },
        message: 'first',
      },
    ]);
  });
});

describe('readChangedEntries', () => {
  test('returns the entries of a commit against its parent or the empty tree', async () => {
    const [root, child] = await Promise.all([readCommit(repo.git, first), readCommit(repo.git, second)]);
    await expect(readChangedEntries(repo.git, root)).resolves.toEqual([
      { relativePath: 'a.txt', originalRelativePath: '', change: Change.ADDED },
    ]);
    await expect(readChangedEntries(repo.git, child)).resolves.toEqual([
      { relativePath: 'b.txt', originalRelativePath: '', change: Change.ADDED },
    ]);
  });
});

describe('parseNameStatus', () => {
  test('parses name-status entries including renames and copies', () => {
    const text = [
      'A',
      'new.txt',
      'M',
      'a.txt',
      'R100',
      'old.txt',
      'moved.txt',
      'C75',
      'a.txt',
      'copy.txt',
      'D',
      'gone.txt',
      'T',
      'link',
    ].join('\0');
    expect(parseNameStatus(`${text}\0`)).toEqual([
      { relativePath: 'new.txt', originalRelativePath: '', change: Change.ADDED },
      { relativePath: 'a.txt', originalRelativePath: '', change: Change.MODIFIED },
      { relativePath: 'moved.txt', originalRelativePath: 'old.txt', change: Change.RENAMED },
      { relativePath: 'copy.txt', originalRelativePath: 'a.txt', change: Change.COPIED },
      { relativePath: 'gone.txt', originalRelativePath: '', change: Change.DELETED },
      { relativePath: 'link', originalRelativePath: '', change: Change.OTHER },
    ]);
  });
});
