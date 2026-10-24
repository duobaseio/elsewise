import { expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { parseBlame, readBlame } from './blame';

const H1 = '1'.repeat(40);
const ZERO = '0'.repeat(40);

test('groups lines by commit and leaves out the details of uncommitted lines', () => {
  const text = [
    'filename stray.txt', // Not after a header, so ignored.
    `${H1} 1 1 2`,
    'author Ann',
    'author-mail <ann@e.com>',
    'author-time 100',
    'author-tz +0000',
    'committer Ann',
    'committer-mail <ann@e.com>',
    'committer-time 100',
    'committer-tz +0000',
    'summary first',
    'filename old.txt',
    '\tline 1',
    `${H1} 2 2`,
    '\tline 2',
    `${ZERO} 3 3 1`,
    'author Not Committed Yet',
    'author-mail <not.committed.yet>',
    'author-time 200',
    'author-tz +0000',
    'committer Not Committed Yet',
    'committer-mail <not.committed.yet>',
    'committer-time 200',
    'committer-tz +0000',
    'summary Version of a.txt from a.txt',
    'previous x a.txt',
    'filename a.txt',
    '\tline 3',
    `${H1} 5 4 1`,
    '\tline 4',
    '',
  ].join('\n');
  const ranges = parseBlame(text);
  expect(ranges).toMatchObject([
    {
      line: 1,
      lineCount: 2,
      hash: H1,
      summary: 'first',
      originalLine: 1,
      originalRelativePath: 'old.txt',
      author: { name: 'Ann' },
    },
    { line: 3, lineCount: 1, hash: '', summary: '', originalLine: 0, originalRelativePath: '' },
    { line: 4, lineCount: 1, hash: H1, summary: 'first', originalLine: 5, originalRelativePath: 'old.txt' },
  ]);
  expect(ranges[1]).not.toHaveProperty('author');
});

test('returns the blame of the worktree or revision', async () => {
  const repo = await TestRepo.create();
  const first = await repo.commit('a.txt', 'A\n', 'first');
  await repo.write('a.txt', 'A\nB\n');

  await expect(readBlame(repo.git, '', 'a.txt')).resolves.toMatchObject([
    { line: 1, lineCount: 1, hash: first, summary: 'first', author: { name: 'Test' } },
    { line: 2, lineCount: 1, hash: '' },
  ]);
  await expect(readBlame(repo.git, 'HEAD', 'a.txt')).resolves.toMatchObject([{ line: 1, lineCount: 1, hash: first }]);
  await repo.remove();
});
