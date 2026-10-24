import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { toProtocolPath } from '../../fs/path';
import {
  hasBranch,
  hasHead,
  hasRef,
  parseBranches,
  parseRemotes,
  parseTags,
  readBranch,
  readBranches,
  readRemote,
  readRemotes,
  readTag,
  readTags,
  upstreamRemote,
} from './refs';

const US = '\x1f';

let repo: TestRepo;
let first: string;

beforeAll(async () => {
  repo = await TestRepo.create();
  first = await repo.commit('a.txt', 'A', 'first');
  await repo.run('tag', 'light');
  await repo.run('tag', '--annotate', '--message', 'release', 'v1');
  await repo.run('remote', 'add', 'origin', 'https://example.com/r.git');
  await repo.run('update-ref', 'refs/remotes/origin/main', first);
  await repo.run('branch', '--set-upstream-to=origin/main');
});

afterAll(() => repo.remove());

function branch(fields: string[]): string {
  return `${fields.join(US)}\0`;
}

describe('readBranches', () => {
  test('return the branches', async () => {
    await expect(readBranches(repo.git)).resolves.toMatchObject([
      {
        name: 'main',
        remote: '',
        upstream: 'origin/main',
        upstreamGone: false,
        ahead: 0,
        behind: 0,
        worktreeAbsolutePath: toProtocolPath(repo.nativeRoot),
        commit: {
          hash: first,
          parentHashes: [],
          message: 'first',
          author: { name: 'Test', email: 'test@example.com' },
        },
      },
      { name: 'origin/main', remote: 'origin', upstream: '', worktreeAbsolutePath: '' },
    ]);
  });
});

describe('readBranch', () => {
  test('return a branch by name', async () => {
    const [main] = await readBranches(repo.git);
    await expect(readBranch(repo.git, 'main')).resolves.toEqual(main);
    await expect(readBranch(repo.git, 'nope')).rejects.toThrow('branch nope not found');
  });
});

describe('hasRef', () => {
  test('whether a ref, a local branch or HEAD exists', async () => {
    await expect(hasRef(repo.git, 'refs/tags/v1')).resolves.toBe(true);
    await expect(hasRef(repo.git, 'refs/tags/nope')).resolves.toBe(false);
    await expect(hasBranch(repo.git, 'main')).resolves.toBe(true);
    await expect(hasBranch(repo.git, 'origin/main')).resolves.toBe(false);
    await expect(hasHead(repo.git)).resolves.toBe(true);

    const empty = await TestRepo.create();
    await expect(hasHead(empty.git)).resolves.toBe(false);
    await empty.remove();
  });
});

describe('parseBranches', () => {
  test('parses local and remote branches', () => {
    const text =
      branch([
        'refs/heads/main',
        'main',
        '',
        'h1',
        'h0',
        'A',
        'a@e',
        '1',
        'C',
        'c@e',
        '2',
        'origin/main',
        'ahead 1, behind 2',
        '/wt',
        'msg\n',
      ]) +
      branch([
        'refs/remotes/origin/HEAD',
        'origin/HEAD',
        'refs/remotes/origin/main',
        'h1',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]) +
      branch([
        'refs/remotes/origin/main',
        'origin/main',
        '',
        'h1',
        'h0',
        'A',
        'a@e',
        '1',
        'C',
        'c@e',
        '2',
        '',
        '',
        '',
        'msg\n',
      ]) +
      branch([
        'refs/heads/old',
        'old',
        '',
        'h0',
        '',
        'A',
        'a@e',
        '1',
        'A',
        'a@e',
        '1',
        'origin/old',
        'gone',
        '',
        'first\n',
      ]);
    const branches = parseBranches(text, ['origin']);
    expect(branches.map((b) => b.name)).toEqual(['main', 'origin/main', 'old']);
    expect(branches[0]).toMatchObject({
      remote: '',
      upstream: 'origin/main',
      upstreamGone: false,
      ahead: 1,
      behind: 2,
      worktreeAbsolutePath: '/wt',
      commit: { hash: 'h1', parentHashes: ['h0'], message: 'msg' },
    });
    expect(branches[1]).toMatchObject({ remote: 'origin', upstream: '', worktreeAbsolutePath: '' });
    expect(branches[2]).toMatchObject({ upstreamGone: true, ahead: 0, behind: 0 });
  });

  test('returns a remote branch by the longest remote name that starts with it', () => {
    const text =
      branch(['refs/remotes/a/b/main', 'a/b/main', '', 'h', '', '', '', '', '', '', '', '', '', '', '']) +
      branch(['refs/remotes/a/main', 'a/main', '', 'h', '', '', '', '', '', '', '', '', '', '', '']) +
      branch(['refs/remotes/x/main', 'x/main', '', 'h', '', '', '', '', '', '', '', '', '', '', '']);
    expect(parseBranches(text, ['a', 'a/b']).map((b) => b.remote)).toEqual(['a/b', 'a', 'x']);
  });
});

describe('upstreamRemote', () => {
  test('return the upstream remote or returns undefined if it does not exist', async () => {
    await repo.run('config', 'branch.forked.remote', 'fork');
    await repo.run('config', 'branch.local.remote', '.');
    await expect(upstreamRemote(repo.git, 'main')).resolves.toBe('origin');
    await expect(upstreamRemote(repo.git, 'forked')).resolves.toBe('fork');
    await expect(upstreamRemote(repo.git, 'local')).resolves.toBeUndefined();
    await expect(upstreamRemote(repo.git, 'none')).resolves.toBeUndefined();
  });
});

describe('readTags', () => {
  test('return the tags', async () => {
    await expect(readTags(repo.git)).resolves.toMatchObject([
      { name: 'light', hash: first, message: '' },
      { name: 'v1', hash: first, message: 'release', tagger: { name: 'Test' } },
    ]);
  });
});

describe('readTag', () => {
  test('returns a tag by name', async () => {
    await expect(readTag(repo.git, 'v1')).resolves.toMatchObject({ name: 'v1' });
    await expect(readTag(repo.git, 'nope')).rejects.toThrow('tag nope not found');
  });
});

describe('parseTags', () => {
  test('parses lightweight and annotated tags', () => {
    const light = ['v1', 'commit', 'h1', '', '', '', '', 'commit msg\n'].join(US);
    const annotated = ['v2', 'tag', 't2', 'h2', 'T', 't@e', '5', 'tag msg\n'].join(US);
    const text = `${light}\0${annotated}\0`;
    expect(parseTags(text)).toMatchObject([
      { name: 'v1', hash: 'h1', message: '' },
      { name: 'v2', hash: 'h2', message: 'tag msg', tagger: { name: 'T', email: 't@e' } },
    ]);
    expect(parseTags(text)[0]).not.toHaveProperty('tagger');
  });
});

describe('readRemotes', () => {
  test('return the remotes', async () => {
    await expect(readRemotes(repo.git)).resolves.toEqual([
      { name: 'origin', fetchUrl: 'https://example.com/r.git', pushUrl: 'https://example.com/r.git' },
    ]);
  });
});

describe('readRemote', () => {
  test('returns a remote by name', async () => {
    await expect(readRemote(repo.git, 'origin')).resolves.toMatchObject({ name: 'origin' });
    await expect(readRemote(repo.git, 'nope')).rejects.toThrow('remote nope not found');
  });
});

describe('parseRemotes', () => {
  test('parses remotes sorted by name', () => {
    const text = 'origin\thttps://a (fetch)\norigin\thttps://b (push)\nfork\tgit@c (fetch)\nfork\tgit@c (push)\n';
    expect(parseRemotes(text)).toEqual([
      { name: 'fork', fetchUrl: 'git@c', pushUrl: 'git@c' },
      { name: 'origin', fetchUrl: 'https://a', pushUrl: 'https://b' },
    ]);
  });
});
