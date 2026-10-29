import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TestRepo } from '../../../test/git/repo';
import { parseStashes, readStashes } from './stash';

const US = '\x1f';

let repo: TestRepo;

beforeEach(async () => {
  repo = await TestRepo.create();
});

afterEach(() => repo.remove());

describe('readStashes', () => {
  test('returns the stashes sorted by newest to oldest', async () => {
    const base = await repo.commit('a.txt', 'A');
    await repo.write('a.txt', 'B');
    await repo.run('stash', 'push', '--quiet', '--message', 'tracked');
    await repo.write('new.txt', 'N');
    await repo.run('stash', 'push', '--quiet', '--include-untracked', '--message', 'with untracked');

    await expect(readStashes(repo.git)).resolves.toMatchObject([
      { index: 0, branch: 'main', baseHash: base, message: 'with untracked', untracked: true },
      { index: 1, branch: 'main', baseHash: base, message: 'tracked', untracked: false },
    ]);
  });
});

describe('parseStashes', () => {
  test('parses stashes', () => {
    const named = ['s1', 'b1 i1 u1', '10', 'On main: my msg'].join(US);
    const detached = ['s2', 'b2 i2', '20', 'WIP on (no branch): abc subject'].join(US);
    const text = `${named}\0\n${detached}\0\n`;
    expect(parseStashes(text)).toEqual([
      {
        index: 0,
        hash: 's1',
        branch: 'main',
        baseHash: 'b1',
        message: 'my msg',
        time: timestampFromMs(10_000),
        untracked: true,
      },
      {
        index: 1,
        hash: 's2',
        branch: '',
        baseHash: 'b2',
        message: 'abc subject',
        time: timestampFromMs(20_000),
        untracked: false,
      },
    ]);
  });

  test('falls back to the whole subject as the message and skips blank records', () => {
    const custom = ['s1', 'b1 i1', '10', 'custom subject'].join(US);
    expect(parseStashes(`\n${custom}\0\n\0`)).toMatchObject([
      { branch: '', message: 'custom subject', untracked: false },
    ]);
    expect(parseStashes('')).toEqual([]);
  });
});
