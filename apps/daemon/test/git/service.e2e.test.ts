import fs from 'node:fs/promises';
import path from 'node:path';
import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Change, FastForward, Status_Entry_Conflicted_Kind as Kind } from '../../src/gen/elsewise/daemon/git/v1/git_pb';
import {
  PullRequest_Mode,
  PushRequest_Force,
  PushStashRequest_Scope,
  ResetRequest_Mode,
  SetIdentityRequest_Scope,
  ResolveConflictsRequest_Side as Side,
  type WatchStatusResponse,
} from '../../src/gen/elsewise/daemon/git/v1/git_service_pb';
import { collect } from '../harness';
import { GitHarness } from './harness';
import type { Repo } from './repo';

const NEVER_POLL = 60_000; // A poll interval no test outlasts.

let harness: GitHarness;
let repo: Repo;
let root: string;

beforeEach(async () => {
  harness = await GitHarness.start({ readLimitBytes: 1024, logLimit: 3, pollIntervalMs: NEVER_POLL });
  repo = await harness.repo('repo');
  root = repo.protocolRoot;
});

afterEach(async () => {
  await harness.close();
});

function entries(seen: WatchStatusResponse[]): string[] | undefined {
  return seen.at(-1)?.status?.entries.map((entry) => `${entry.kind.case}:${entry.relativePath}`);
}

/** Makes `main` and a `feature` branch that both change `conflict.txt`. Leaves `main` checked out. */
async function diverge(): Promise<{ base: string; feature: string }> {
  const base = await repo.commit('conflict.txt', 'base\n', 'base');
  await repo.run('switch', '--quiet', '--create', 'feature');
  const feature = await repo.commit('conflict.txt', 'feature\n', 'feature');
  await repo.run('switch', '--quiet', 'main');
  await repo.commit('conflict.txt', 'main\n', 'main');
  return { base, feature };
}

describe('common fields', () => {
  test('rejects a relative path, a missing folder and a folder that is not a worktree', async () => {
    await expect(harness.client.getStatus({ absolutePath: 'relative' })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
    await expect(harness.client.getStatus({ absolutePath: `${harness.protocolRoot}/missing` })).rejects.toMatchObject({
      code: Code.NOT_FOUND,
    });
    await fs.mkdir(harness.nativeAt('plain'));
    await expect(harness.client.getStatus({ absolutePath: `${harness.protocolRoot}/plain` })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await fs.mkdir(harness.nativeAt('repo', 'sub'));
    await expect(harness.client.getStatus({ absolutePath: `${root}/sub` })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
  });

  test('refuses an operand that reads as an option or a path that leaves the worktree', async () => {
    const client = harness.client;
    const option = '--all';
    const outside = '../x';
    const wt = `${harness.protocolRoot}/wt`;
    const calls: Record<string, () => Promise<unknown>> = {
      'stage.relativePaths': () => client.stage({ absolutePath: root, relativePaths: [outside] }),
      'unstage.relativePaths': () => client.unstage({ absolutePath: root, relativePaths: [outside] }),
      'discard.relativePaths': () => client.discard({ absolutePath: root, relativePaths: [outside] }),
      'restore.relativePaths': () => client.restore({ absolutePath: root, relativePaths: [outside] }),
      'restore.revision': () => client.restore({ absolutePath: root, revision: option }),
      'getDiff.relativePaths': () =>
        client.getDiff({ absolutePath: root, target: { case: 'unstaged', value: {} }, relativePaths: [outside] }),
      'getDiff.fromRevision': () =>
        client.getDiff({ absolutePath: root, target: { case: 'revisions', value: { fromRevision: option } } }),
      'getDiff.toRevision': () =>
        client.getDiff({
          absolutePath: root,
          target: { case: 'revisions', value: { fromRevision: 'HEAD', toRevision: option } },
        }),
      'readFileAtRevision.relativePath': () => client.readFileAtRevision({ absolutePath: root, relativePath: outside }),
      'readFileAtRevision.revision': () =>
        client.readFileAtRevision({ absolutePath: root, relativePath: 'a.txt', revision: option }),
      'getBlame.relativePath': () => client.getBlame({ absolutePath: root, relativePath: outside }),
      'getBlame.revision': () => client.getBlame({ absolutePath: root, relativePath: 'a.txt', revision: option }),
      'getLog.revisions': () => client.getLog({ absolutePath: root, revisions: [option] }),
      'getLog.relativePaths': () => client.getLog({ absolutePath: root, relativePaths: [outside] }),
      'getCommit.revision': () => client.getCommit({ absolutePath: root, revision: option }),
      'getMergeBase.revision': () =>
        client.getMergeBase({ absolutePath: root, revision: option, otherRevision: 'HEAD' }),
      'getMergeBase.otherRevision': () =>
        client.getMergeBase({ absolutePath: root, revision: 'HEAD', otherRevision: option }),
      'reset.revision': () => client.reset({ absolutePath: root, mode: ResetRequest_Mode.MIXED, revision: option }),
      'createBranch.name': () => client.createBranch({ absolutePath: root, name: option }),
      'createBranch.revision': () => client.createBranch({ absolutePath: root, name: 'x', revision: option }),
      'renameBranch.name': () => client.renameBranch({ absolutePath: root, name: option, newName: 'x' }),
      'renameBranch.newName': () => client.renameBranch({ absolutePath: root, name: 'x', newName: option }),
      'setBranchUpstream.branch': () => client.setBranchUpstream({ absolutePath: root, branch: option }),
      'setBranchUpstream.upstream': () =>
        client.setBranchUpstream({ absolutePath: root, branch: 'main', upstream: option }),
      'deleteBranch.name': () => client.deleteBranch({ absolutePath: root, name: option }),
      'checkout.branch': () => client.checkout({ absolutePath: root, target: { case: 'branch', value: option } }),
      'checkout.revision': () => client.checkout({ absolutePath: root, target: { case: 'revision', value: option } }),
      'addWorktree.branch': () => client.addWorktree({ absolutePath: root, newAbsolutePath: wt, branch: option }),
      'addWorktree.revision': () => client.addWorktree({ absolutePath: root, newAbsolutePath: wt, revision: option }),
      'createTag.name': () => client.createTag({ absolutePath: root, name: option }),
      'createTag.revision': () => client.createTag({ absolutePath: root, name: 'x', revision: option }),
      'deleteTag.name': () => client.deleteTag({ absolutePath: root, name: option }),
      'merge.revision': () => client.merge({ absolutePath: root, revision: option }),
      'rebase.revision': () => client.rebase({ absolutePath: root, revision: option }),
      'cherryPick.revisions': () => client.cherryPick({ absolutePath: root, revisions: [option] }),
      'revert.revisions': () => client.revert({ absolutePath: root, revisions: [option] }),
      'resolveConflicts.relativePaths': () =>
        client.resolveConflicts({ absolutePath: root, side: Side.OURS, relativePaths: [outside] }),
      'addRemote.name': () => client.addRemote({ absolutePath: root, name: option, url: 'u' }),
      'addRemote.url': () => client.addRemote({ absolutePath: root, name: 'x', url: option }),
      'updateRemote.remote': () => client.updateRemote({ absolutePath: root, remote: option }),
      'updateRemote.name': () => client.updateRemote({ absolutePath: root, remote: 'x', name: option }),
      'updateRemote.fetchUrl': () => client.updateRemote({ absolutePath: root, remote: 'x', fetchUrl: option }),
      'updateRemote.pushUrl': () => client.updateRemote({ absolutePath: root, remote: 'x', pushUrl: option }),
      'removeRemote.name': () => client.removeRemote({ absolutePath: root, name: option }),
      'fetch.remote': () => collect(client.fetch({ absolutePath: root, remote: option })).ended,
      'pull.remote': () => collect(client.pull({ absolutePath: root, remote: option })).ended,
      'pull.branch': () => collect(client.pull({ absolutePath: root, remote: 'x', branch: option })).ended,
      'push.remote': () =>
        collect(client.push({ absolutePath: root, remote: option, target: { case: 'branch', value: 'main' } })).ended,
      'push.branch': () =>
        collect(client.push({ absolutePath: root, target: { case: 'branch', value: option } })).ended,
      'push.tag': () => collect(client.push({ absolutePath: root, target: { case: 'tag', value: option } })).ended,
      'pushStash.relativePaths': () => client.pushStash({ absolutePath: root, relativePaths: [outside] }),
    };
    const accepted: string[] = [];
    for (const [name, call] of Object.entries(calls)) {
      const code = await call().then(
        () => undefined,
        (error: { code?: Code }) => error.code,
      );
      if (code !== Code.INVALID_ARGUMENT) {
        accepted.push(name);
      }
    }
    expect(accepted).toEqual([]);
  });
});

describe('status', () => {
  test('reports a repository with no commits', async () => {
    await expect(harness.client.getStatus({ absolutePath: root })).resolves.toMatchObject({
      status: { branch: 'main', hash: '', upstream: '', entries: [], operation: { case: undefined } },
    });
  });

  test('reports every kind of entry', async () => {
    const hash = await repo.commit('a.txt', 'a\n');
    await repo.commit('b.txt', 'b\n');
    await repo.write('a.txt', 'changed\n');
    await repo.run('mv', 'b.txt', 'c.txt');
    await repo.write('new.txt', '');
    await repo.write('.gitignore', 'ignored.txt\n');
    await repo.write('ignored.txt', '');

    const { status } = await harness.client.getStatus({ absolutePath: root, includeIgnored: true });

    expect(status?.hash).not.toBe(hash);
    expect(status?.entries).toMatchObject([
      {
        relativePath: 'a.txt',
        kind: { case: 'changed', value: { staged: Change.UNSPECIFIED, unstaged: Change.MODIFIED } },
      },
      {
        relativePath: 'c.txt',
        kind: { case: 'changed', value: { staged: Change.RENAMED, originalRelativePath: 'b.txt' } },
      },
      { relativePath: '.gitignore', kind: { case: 'untracked' } },
      { relativePath: 'new.txt', kind: { case: 'untracked' } },
      { relativePath: 'ignored.txt', kind: { case: 'ignored' } },
    ]);
    const without = await harness.client.getStatus({ absolutePath: root });
    expect(without.status?.entries.map((entry) => entry.relativePath)).not.toContain('ignored.txt');
  });

  test('reports the upstream with how far the branch is ahead and behind', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.run('branch', 'upstream');
    await repo.run('branch', '--set-upstream-to=upstream');
    await repo.commit('b.txt', 'b\n');

    await expect(harness.client.getStatus({ absolutePath: root })).resolves.toMatchObject({
      status: { upstream: 'upstream', upstreamGone: false, ahead: 1, behind: 0 },
    });

    await repo.run('branch', '--delete', '--force', 'upstream');
    await expect(harness.client.getStatus({ absolutePath: root })).resolves.toMatchObject({
      status: { upstream: 'upstream', upstreamGone: true, ahead: 0 },
    });
  });

  test('reports the status immediately and whenever it changes', async () => {
    await repo.commit('a.txt', 'a\n');
    const abort = new AbortController();
    const { seen, ended } = collect(harness.client.watchStatus({ absolutePath: root }, { signal: abort.signal }));
    await expect.poll(() => entries(seen)).toEqual([]);

    await repo.write('a.txt', 'changed\n');
    await expect.poll(() => entries(seen)).toEqual(['changed:a.txt']);

    await repo.run('add', 'a.txt');
    await repo.run('commit', '--quiet', '--message', 'change');
    await expect.poll(() => entries(seen)).toEqual([]);
    expect(seen).toHaveLength(3);

    abort.abort();
    await expect(ended).rejects.toMatchObject({ code: Code.CANCELLED });
  });

  test('reports a linked worktree whose git directory lies elsewhere', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.run('worktree', 'add', '--quiet', harness.nativeAt('linked'), '-b', 'linked');
    const linked = harness.open('linked');
    const abort = new AbortController();
    const { seen } = collect(
      harness.client.watchStatus({ absolutePath: linked.protocolRoot }, { signal: abort.signal }),
    );
    await expect.poll(() => seen.at(-1)?.status?.branch).toBe('linked');

    await linked.write('a.txt', 'changed\n');
    await linked.run('add', 'a.txt');
    await expect.poll(() => entries(seen)).toEqual(['changed:a.txt']);
    abort.abort();
  });
});

describe('stage', () => {
  test('stages, unstages, discards and restores entries', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.commit('dir/b.txt', 'b\n');
    await repo.write('a.txt', 'changed\n');
    await repo.write('dir/b.txt', 'changed\n');
    await repo.write('dir/new.txt', 'new\n');

    await harness.client.stage({ absolutePath: root, relativePaths: ['dir'] });
    let { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([
      { relativePath: 'a.txt', kind: { value: { staged: Change.UNSPECIFIED, unstaged: Change.MODIFIED } } },
      { relativePath: 'dir/b.txt', kind: { value: { staged: Change.MODIFIED, unstaged: Change.UNSPECIFIED } } },
      { relativePath: 'dir/new.txt', kind: { value: { staged: Change.ADDED } } },
    ]);

    await harness.client.unstage({ absolutePath: root, relativePaths: [] });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries.map((entry) => entry.kind.case)).toEqual(['changed', 'changed', 'untracked']);

    await harness.client.discard({ absolutePath: root, relativePaths: ['dir/new.txt', 'a.txt'] });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries.map((entry) => entry.relativePath)).toEqual(['dir/b.txt']);

    await harness.client.stage({ absolutePath: root, relativePaths: [] });
    await harness.client.restore({ absolutePath: root, relativePaths: ['dir/b.txt'], revision: '' });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries).toEqual([]);
    await expect(repo.read('dir/b.txt')).resolves.toBe('b\n');
  });

  test('stages and unstages in a repository with no commits yet', async () => {
    await repo.write('a.txt', 'a\n');
    await harness.client.stage({ absolutePath: root, relativePaths: [] });
    let { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([{ relativePath: 'a.txt', kind: { value: { staged: Change.ADDED } } }]);

    await harness.client.unstage({ absolutePath: root, relativePaths: ['a.txt'] });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries).toMatchObject([{ relativePath: 'a.txt', kind: { case: 'untracked' } }]);
  });

  test('restores an entry from a revision', async () => {
    const first = await repo.commit('a.txt', 'first\n');
    await repo.commit('a.txt', 'second\n');
    await harness.client.restore({ absolutePath: root, relativePaths: ['a.txt'], revision: first });
    await expect(repo.read('a.txt')).resolves.toBe('first\n');
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([
      { kind: { value: { staged: Change.MODIFIED, unstaged: Change.UNSPECIFIED } } },
    ]);
  });
});

describe('content', () => {
  test('diffs the unstaged and staged changes and revisions', async () => {
    const first = await repo.commit('a.txt', 'first\n');
    await repo.write('a.txt', 'second\n');
    await repo.run('add', 'a.txt');
    await repo.write('a.txt', 'third\n');
    const decoder = new TextDecoder();

    const unstaged = await harness.client.getDiff({ absolutePath: root, target: { case: 'unstaged', value: {} } });
    expect(decoder.decode(unstaged.patch)).toContain('-second\n+third');
    const staged = await harness.client.getDiff({ absolutePath: root, target: { case: 'staged', value: {} } });
    expect(decoder.decode(staged.patch)).toContain('-first\n+second');
    const revisions = await harness.client.getDiff({
      absolutePath: root,
      target: { case: 'revisions', value: { fromRevision: first, toRevision: '' } },
      relativePaths: ['a.txt'],
    });
    expect(decoder.decode(revisions.patch)).toContain('-first\n+third');
    await expect(harness.client.getDiff({ absolutePath: root })).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });

  test('fails a diff over the read limit', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.write('a.txt', 'x'.repeat(2048));
    const call = harness.client.getDiff({ absolutePath: root, target: { case: 'unstaged', value: {} } });
    await expect(call).rejects.toMatchObject({ code: Code.RESOURCE_EXHAUSTED });
  });

  test('returns a file at a revision or as staged', async () => {
    const first = await repo.commit('a.txt', 'first\n');
    await repo.write('a.txt', 'staged\n');
    await repo.run('add', 'a.txt');
    await repo.write('a.txt', 'disk\n');
    await repo.commit('bin', 'a\0b');
    const decoder = new TextDecoder();

    const at = await harness.client.readFileAtRevision({ absolutePath: root, relativePath: 'a.txt', revision: first });
    expect(decoder.decode(at.content)).toBe('first\n');
    expect(at.binary).toBe(false);
    const staged = await harness.client.readFileAtRevision({ absolutePath: root, relativePath: 'a.txt' });
    expect(decoder.decode(staged.content)).toBe('staged\n');
    const binary = await harness.client.readFileAtRevision({
      absolutePath: root,
      relativePath: 'bin',
      revision: 'HEAD',
    });
    expect(binary.binary).toBe(true);
    const missing = harness.client.readFileAtRevision({ absolutePath: root, relativePath: 'nope', revision: 'HEAD' });
    await expect(missing).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });

  test('blames a file on disk and at a revision', async () => {
    const first = await repo.commit('a.txt', 'one\ntwo\n', 'first');
    const second = await repo.commit('a.txt', 'one\nchanged\n', 'second');
    await repo.write('a.txt', 'one\nchanged\nnew\n');

    const disk = await harness.client.getBlame({ absolutePath: root, relativePath: 'a.txt' });
    expect(disk.ranges).toMatchObject([
      { line: 1, lineCount: 1, hash: first, summary: 'first', originalLine: 1, author: { name: 'Test' } },
      { line: 2, lineCount: 1, hash: second, summary: 'second', originalLine: 2, author: { name: 'Test' } },
      { line: 3, lineCount: 1, hash: '', originalLine: 0, originalRelativePath: '' },
    ]);
    expect(disk.ranges[2]).not.toHaveProperty('author');
    const at = await harness.client.getBlame({ absolutePath: root, relativePath: 'a.txt', revision: first });
    expect(at.ranges).toMatchObject([{ line: 1, lineCount: 2, hash: first, originalRelativePath: 'a.txt' }]);
  });
});

describe('commits', () => {
  test('commits the staged changes and amends them', async () => {
    await repo.write('a.txt', 'a\n');
    await expect(harness.client.commit({ absolutePath: root, message: 'new' })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await repo.run('add', 'a.txt');
    await expect(harness.client.commit({ absolutePath: root, message: '' })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });

    const { commit } = await harness.client.commit({ absolutePath: root, message: 'new\n\nbody' });
    expect(commit).toMatchObject({
      message: 'new\n\nbody',
      parentHashes: [],
      author: { name: 'Test', email: 'test@example.com' },
    });
    expect(commit?.hash).toBe(await repo.run('rev-parse', 'HEAD'));

    await repo.write('a.txt', 'b\n');
    await repo.run('add', 'a.txt');
    const amended = await harness.client.commit({ absolutePath: root, message: '', amend: true });
    expect(amended.commit).toMatchObject({ message: 'new\n\nbody', parentHashes: [] });
    expect(amended.commit?.hash).not.toBe(commit?.hash);
  });

  test('paginates the log and is empty with no commits', async () => {
    await expect(harness.client.getLog({ absolutePath: root })).resolves.toMatchObject({ commits: [] });
    const hashes = [];
    for (let i = 0; i < 5; i++) {
      hashes.push(await repo.commit(i % 2 === 0 ? 'even.txt' : 'odd.txt', `${i}\n`, `commit ${i}`));
    }
    hashes.reverse();

    const page = await harness.client.getLog({ absolutePath: root });
    expect(page.commits.map((commit) => commit.hash)).toEqual(hashes.slice(0, 3));
    const next = await harness.client.getLog({ absolutePath: root, skip: 3, limit: 10 });
    expect(next.commits.map((commit) => commit.message)).toEqual(['commit 1', 'commit 0']);
    const odd = await harness.client.getLog({ absolutePath: root, relativePaths: ['odd.txt'], revisions: ['HEAD'] });
    expect(odd.commits.map((commit) => commit.message)).toEqual(['commit 3', 'commit 1']);
    await expect(harness.client.getLog({ absolutePath: root, revisions: ['nope'] })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
  });

  test('returns a commit with what changed', async () => {
    const first = await repo.commit('a.txt', 'a\n', 'first');
    await repo.run('mv', 'a.txt', 'b.txt');
    await repo.write('c.txt', 'c\n');
    await repo.run('add', '--all');
    await repo.run('commit', '--quiet', '--message', 'second');

    const second = await harness.client.getCommit({ absolutePath: root, revision: 'HEAD' });
    expect(second.commit).toMatchObject({ message: 'second', parentHashes: [first] });
    expect(second.entries).toMatchObject([
      { relativePath: 'b.txt', originalRelativePath: 'a.txt', change: Change.RENAMED },
      { relativePath: 'c.txt', originalRelativePath: '', change: Change.ADDED },
    ]);
    const root_ = await harness.client.getCommit({ absolutePath: root, revision: first });
    expect(root_.entries).toMatchObject([{ relativePath: 'a.txt', originalRelativePath: '', change: Change.ADDED }]);
  });

  test('returns the merge base of two revisions', async () => {
    const { base, feature } = await diverge();
    await expect(
      harness.client.getMergeBase({ absolutePath: root, revision: 'main', otherRevision: feature }),
    ).resolves.toMatchObject({ hash: base });
    await expect(harness.client.getMergeBase({ absolutePath: root, revision: feature })).resolves.toMatchObject({
      hash: base,
    });

    await repo.run('switch', '--quiet', '--orphan', 'unrelated');
    const unrelated = await repo.commit('other.txt', 'other\n');
    await expect(
      harness.client.getMergeBase({ absolutePath: root, revision: 'main', otherRevision: unrelated }),
    ).resolves.toMatchObject({ hash: '' });
    await expect(
      harness.client.getMergeBase({ absolutePath: root, revision: 'main', otherRevision: 'nope' }),
    ).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });

  test('resets the branch in each mode', async () => {
    const first = await repo.commit('a.txt', 'a\n');
    await repo.commit('b.txt', 'b\n');
    await expect(harness.client.reset({ absolutePath: root, revision: first })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });

    await harness.client.reset({ absolutePath: root, revision: first, mode: ResetRequest_Mode.SOFT });
    let { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.hash).toBe(first);
    expect(status?.entries).toMatchObject([{ relativePath: 'b.txt', kind: { value: { staged: Change.ADDED } } }]);

    await harness.client.reset({ absolutePath: root, mode: ResetRequest_Mode.MIXED });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries).toMatchObject([{ relativePath: 'b.txt', kind: { case: 'untracked' } }]);

    await repo.write('a.txt', 'changed\n');
    await harness.client.reset({ absolutePath: root, mode: ResetRequest_Mode.HARD });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries).toMatchObject([{ relativePath: 'b.txt', kind: { case: 'untracked' } }]);
  });
});

describe('branches', () => {
  test('lists, creates, renames, set upstreams and deletes branches', async () => {
    const first = await repo.commit('a.txt', 'a\n');
    const { branch } = await harness.client.createBranch({ absolutePath: root, name: 'feature', revision: '' });
    expect(branch).toMatchObject({ name: 'feature', remote: '', commit: { hash: first }, worktreeAbsolutePath: '' });
    await expect(harness.client.createBranch({ absolutePath: root, name: 'feature' })).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });

    const renamed = await harness.client.renameBranch({ absolutePath: root, name: 'feature', newName: 'renamed' });
    expect(renamed.branch?.name).toBe('renamed');

    const upstream = await harness.client.setBranchUpstream({ absolutePath: root, branch: '', upstream: 'renamed' });
    expect(upstream.branch).toMatchObject({ name: 'main', upstream: 'renamed', ahead: 0, behind: 0 });
    await repo.commit('b.txt', 'b\n');
    const { branches } = await harness.client.getBranches({ absolutePath: root });
    expect(branches).toMatchObject([
      { name: 'main', upstream: 'renamed', ahead: 1, behind: 0, worktreeAbsolutePath: root },
      { name: 'renamed', upstream: '' },
    ]);
    const cleared = await harness.client.setBranchUpstream({ absolutePath: root, branch: 'main', upstream: '' });
    expect(cleared.branch?.upstream).toBe('');
    await harness.client.setBranchUpstream({ absolutePath: root, branch: 'main', upstream: '' }); // Already cleared.

    await expect(harness.client.deleteBranch({ absolutePath: root, name: 'main' })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await repo.run('switch', '--quiet', 'renamed');
    await expect(harness.client.deleteBranch({ absolutePath: root, name: 'main' })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION, // Has an unmerged commit.
    });
    await harness.client.deleteBranch({ absolutePath: root, name: 'main', force: true });
    const after = await harness.client.getBranches({ absolutePath: root });
    expect(after.branches.map((candidate) => candidate.name)).toEqual(['renamed']);
  });

  test('creates a branch and checks it out', async () => {
    await repo.commit('a.txt', 'a\n');
    await harness.client.createBranch({ absolutePath: root, name: 'feature', checkout: true });
    await expect(repo.run('branch', '--show-current')).resolves.toBe('feature');
  });

  test('checks out branches, revisions and remote-only branches', async () => {
    const first = await repo.commit('a.txt', 'a\n');
    await repo.run('branch', 'feature');
    await repo.commit('b.txt', 'b\n');
    await harness.client.checkout({ absolutePath: root, target: { case: 'branch', value: 'feature' } });
    await expect(repo.run('branch', '--show-current')).resolves.toBe('feature');

    await harness.client.checkout({ absolutePath: root, target: { case: 'revision', value: 'main' } });
    const detached = await harness.client.getStatus({ absolutePath: root });
    expect(detached.status).toMatchObject({ branch: '' });
    expect(detached.status?.hash).not.toBe(first);

    await repo.run('update-ref', 'refs/remotes/origin/remote-only', first);
    await repo.run('remote', 'add', 'origin', harness.nativeAt('nowhere'));
    await harness.client.checkout({ absolutePath: root, target: { case: 'branch', value: 'remote-only' } });
    await expect(repo.run('branch', '--show-current')).resolves.toBe('remote-only');
    await expect(repo.run('rev-parse', '--abbrev-ref', '@{upstream}')).resolves.toBe('origin/remote-only');
    await expect(harness.client.checkout({ absolutePath: root })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
  });

  test('refuses a checkout that would overwrite local changes', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.run('branch', 'feature');
    await repo.commit('a.txt', 'b\n');
    await repo.write('a.txt', 'local\n');
    const call = harness.client.checkout({ absolutePath: root, target: { case: 'branch', value: 'feature' } });
    await expect(call).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });
});

describe('worktrees', () => {
  test('adds, lists, locks, moves, removes and prunes worktrees', async () => {
    const first = await repo.commit('a.txt', 'a\n');
    const added = await harness.client.addWorktree({
      absolutePath: root,
      newAbsolutePath: `${harness.protocolRoot}/wt`,
      branch: 'feature',
    });
    expect(added.worktree).toMatchObject({
      absolutePath: `${harness.protocolRoot}/wt`,
      branch: 'feature',
      hash: first,
      main: false,
    });
    await expect(
      harness.client.addWorktree({
        absolutePath: root,
        newAbsolutePath: `${harness.protocolRoot}/wt2`,
        branch: 'feature',
      }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION, // Checked out in `wt`.
    });
    await expect(
      harness.client.addWorktree({
        absolutePath: root,
        newAbsolutePath: `${harness.protocolRoot}/wt2`,
        branch: 'main',
        revision: 'HEAD',
      }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION, // Exists, so a revision does not apply.
    });
    await expect(
      harness.client.addWorktree({ absolutePath: root, newAbsolutePath: root, branch: '' }),
    ).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
    const detached = await harness.client.addWorktree({
      absolutePath: root,
      newAbsolutePath: `${harness.protocolRoot}/detached`,
    });
    expect(detached.worktree).toMatchObject({ branch: '', hash: first });
    const { branches } = await harness.client.getBranches({ absolutePath: root });
    expect(branches.find((branch) => branch.name === 'feature')?.worktreeAbsolutePath).toBe(
      `${harness.protocolRoot}/wt`,
    );

    const locked = await harness.client.lockWorktree({
      absolutePath: root,
      worktreeAbsolutePath: `${harness.protocolRoot}/wt`,
      reason: 'busy',
    });
    expect(locked.worktree).toMatchObject({ locked: true, lockReason: 'busy' });
    await expect(
      harness.client.lockWorktree({ absolutePath: root, worktreeAbsolutePath: `${harness.protocolRoot}/wt` }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(harness.client.lockWorktree({ absolutePath: root, worktreeAbsolutePath: root })).rejects.toMatchObject(
      {
        code: Code.INVALID_ARGUMENT,
      },
    );
    await expect(
      harness.client.moveWorktree({
        absolutePath: root,
        worktreeAbsolutePath: `${harness.protocolRoot}/wt`,
        newAbsolutePath: `${harness.protocolRoot}/moved`,
      }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    const unlocked = await harness.client.unlockWorktree({
      absolutePath: root,
      worktreeAbsolutePath: `${harness.protocolRoot}/wt`,
    });
    expect(unlocked.worktree?.locked).toBe(false);
    await expect(
      harness.client.unlockWorktree({ absolutePath: root, worktreeAbsolutePath: `${harness.protocolRoot}/wt` }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });

    const moved = await harness.client.moveWorktree({
      absolutePath: root,
      worktreeAbsolutePath: `${harness.protocolRoot}/wt`,
      newAbsolutePath: `${harness.protocolRoot}/moved`,
    });
    expect(moved.worktree).toMatchObject({ absolutePath: `${harness.protocolRoot}/moved`, branch: 'feature' });
    await expect(
      harness.client.moveWorktree({
        absolutePath: root,
        worktreeAbsolutePath: root,
        newAbsolutePath: `${harness.protocolRoot}/elsewhere`,
      }),
    ).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });

    await harness.open('moved').write('dirty.txt', '');
    await expect(
      harness.client.removeWorktree({ absolutePath: root, worktreeAbsolutePath: `${harness.protocolRoot}/moved` }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await harness.client.removeWorktree({
      absolutePath: root,
      worktreeAbsolutePath: `${harness.protocolRoot}/moved`,
      force: true,
    });

    await fs.rm(harness.nativeAt('detached'), { recursive: true });
    const before = await harness.client.getWorktrees({ absolutePath: root });
    expect(before.worktrees).toMatchObject([{ main: true, absolutePath: root }, { prunable: true }]);
    const pruned = await harness.client.pruneWorktrees({ absolutePath: root });
    expect(pruned.prunedAbsolutePaths).toEqual([`${harness.protocolRoot}/detached`]);
    const after = await harness.client.getWorktrees({ absolutePath: root });
    expect(after.worktrees).toHaveLength(1);
  });
});

describe('tags', () => {
  test('lists, creates and deletes tags', async () => {
    const first = await repo.commit('a.txt', 'a\n');
    const light = await harness.client.createTag({ absolutePath: root, name: 'light' });
    expect(light.tag).toMatchObject({ name: 'light', hash: first, message: '' });
    const annotated = await harness.client.createTag({
      absolutePath: root,
      name: 'annotated',
      revision: first,
      message: 'release',
    });
    expect(annotated.tag).toMatchObject({
      name: 'annotated',
      hash: first,
      message: 'release',
      tagger: { name: 'Test' },
    });
    await expect(harness.client.createTag({ absolutePath: root, name: 'light' })).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });

    const { tags } = await harness.client.getTags({ absolutePath: root });
    expect(tags.map((tag) => tag.name)).toEqual(['annotated', 'light']);
    await harness.client.deleteTag({ absolutePath: root, name: 'light' });
    await expect(harness.client.deleteTag({ absolutePath: root, name: 'light' })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
  });
});

describe('operations', () => {
  test('merges with each fast-forward mode and squashes', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.run('branch', 'feature');
    await repo.run('switch', '--quiet', 'feature');
    const feature = await repo.commit('b.txt', 'b\n');
    await repo.run('switch', '--quiet', 'main');

    await expect(
      harness.client.merge({ absolutePath: root, revision: 'feature', fastForward: FastForward.ONLY }),
    ).resolves.toMatchObject({
      conflicted: false,
    });
    expect(await repo.run('rev-parse', 'HEAD')).toBe(feature);

    await repo.run('reset', '--quiet', '--hard', 'HEAD~1');
    await harness.client.merge({ absolutePath: root, revision: 'feature', fastForward: FastForward.NEVER });
    expect(await repo.run('rev-list', '--count', 'HEAD')).toBe('3');

    await repo.run('reset', '--quiet', '--hard', 'HEAD~1');
    await repo.commit('c.txt', 'c\n');
    await expect(
      harness.client.merge({ absolutePath: root, revision: 'feature', fastForward: FastForward.ONLY }),
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await harness.client.merge({ absolutePath: root, revision: 'feature', squash: true });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([{ relativePath: 'b.txt', kind: { value: { staged: Change.ADDED } } }]);
    expect(status?.operation.case).toBeUndefined();
  });

  test('stops a merge on conflicts, resolve and continue', async () => {
    const { feature } = await diverge();
    await expect(harness.client.merge({ absolutePath: root, revision: 'feature' })).resolves.toMatchObject({
      conflicted: true,
    });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.operation).toMatchObject({ case: 'merge', value: { hashes: [feature] } });
    expect(status?.entries).toMatchObject([
      { relativePath: 'conflict.txt', kind: { value: { kind: Kind.BOTH_MODIFIED } } },
    ]);

    await expect(harness.client.continueOperation({ absolutePath: root })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(harness.client.skipOperation({ absolutePath: root })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await harness.client.resolveConflicts({ absolutePath: root, relativePaths: [], side: Side.THEIRS });
    await expect(repo.read('conflict.txt')).resolves.toBe('feature\n');
    await expect(harness.client.continueOperation({ absolutePath: root })).resolves.toMatchObject({
      conflicted: false,
    });
    const after = await harness.client.getStatus({ absolutePath: root });
    expect(after.status?.operation.case).toBeUndefined();
    expect(await repo.run('rev-list', '--count', 'HEAD')).toBe('4');
  });

  test('aborts a merge and refuses to act with no operation in progress', async () => {
    await diverge();
    await harness.client.merge({ absolutePath: root, revision: 'feature' });
    await harness.client.abortOperation({ absolutePath: root });
    await expect(repo.read('conflict.txt')).resolves.toBe('main\n');
    await expect(harness.client.abortOperation({ absolutePath: root })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(harness.client.continueOperation({ absolutePath: root })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
  });

  test('stops a rebase on conflicts and skip', async () => {
    await diverge();
    await repo.run('switch', '--quiet', 'feature');
    await repo.commit('other.txt', 'other\n');
    await expect(harness.client.rebase({ absolutePath: root, revision: 'main' })).resolves.toMatchObject({
      conflicted: true,
    });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.operation).toMatchObject({ case: 'rebase', value: { step: 1, total: 2 } });
    expect(status?.operation.value).toHaveProperty('hash', await repo.run('rev-parse', 'REBASE_HEAD'));

    await harness.client.resolveConflicts({ absolutePath: root, relativePaths: ['conflict.txt'], side: Side.OURS });
    await expect(repo.read('conflict.txt')).resolves.toBe('main\n'); // Ours is the branch rebased onto.
    await expect(harness.client.skipOperation({ absolutePath: root })).resolves.toMatchObject({ conflicted: false });
    await expect(repo.run('log', '--format=%s')).resolves.toBe('write other.txt\nmain\nbase');
  });

  test('cherry-picks and reverts commits', async () => {
    const { feature } = await diverge();
    await repo.run('switch', '--quiet', 'feature');
    const other = await repo.commit('other.txt', 'other\n', 'other');
    await repo.run('switch', '--quiet', 'main');

    await expect(harness.client.cherryPick({ absolutePath: root, revisions: [other] })).resolves.toMatchObject({
      conflicted: false,
    });
    await expect(repo.read('other.txt')).resolves.toBe('other\n');
    await expect(harness.client.cherryPick({ absolutePath: root, revisions: [feature] })).resolves.toMatchObject({
      conflicted: true,
    });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.operation).toMatchObject({ case: 'cherryPick', value: { hash: feature } });
    await harness.client.abortOperation({ absolutePath: root });

    await expect(harness.client.revert({ absolutePath: root, revisions: ['HEAD'] })).resolves.toMatchObject({
      conflicted: false,
    });
    await expect(fs.access(path.join(repo.nativeRoot, 'other.txt'))).rejects.toThrow();
    await expect(harness.client.revert({ absolutePath: root, revisions: [] })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
  });

  test('needs a mainline to apply a merge commit', async () => {
    await repo.commit('base.txt', 'base\n');
    await repo.run('switch', '--quiet', '--create', 'feature');
    await repo.commit('feature.txt', 'feature\n');
    await repo.run('switch', '--quiet', 'main');
    await repo.commit('main.txt', 'main\n');
    await repo.run('merge', '--quiet', '--no-edit', '--no-ff', 'feature');
    const merge = await repo.run('rev-parse', 'HEAD');
    expect((await harness.client.getLog({ absolutePath: root, revisions: ['HEAD'] })).commits[0]?.hash).toBe(merge);
    await repo.run('switch', '--quiet', '--detach', 'HEAD~1');
    await expect(harness.client.cherryPick({ absolutePath: root, revisions: [merge] })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(
      harness.client.cherryPick({ absolutePath: root, revisions: [merge], mainline: 1 }),
    ).resolves.toMatchObject({
      conflicted: false,
    });
  });

  test('resolves a conflict where one side deleted the entry', async () => {
    await repo.commit('gone.txt', 'a\n');
    await repo.run('switch', '--quiet', '--create', 'feature');
    await repo.run('rm', '--quiet', 'gone.txt');
    await repo.run('commit', '--quiet', '--message', 'delete');
    await repo.run('switch', '--quiet', 'main');
    await repo.commit('gone.txt', 'changed\n');

    await expect(harness.client.merge({ absolutePath: root, revision: 'feature' })).resolves.toMatchObject({
      conflicted: true,
    });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([
      { relativePath: 'gone.txt', kind: { value: { kind: Kind.DELETED_BY_THEM } } },
    ]);
    await harness.client.resolveConflicts({ absolutePath: root, relativePaths: [], side: Side.THEIRS });
    await expect(fs.access(path.join(repo.nativeRoot, 'gone.txt'))).rejects.toThrow();
    await expect(harness.client.continueOperation({ absolutePath: root })).resolves.toMatchObject({
      conflicted: false,
    });
  });
});

describe('remotes', () => {
  test('adds, lists, updates and removes remotes', async () => {
    const added = await harness.client.addRemote({
      absolutePath: root,
      name: 'origin',
      url: 'https://example.com/a.git',
    });
    expect(added.remote).toMatchObject({
      name: 'origin',
      fetchUrl: 'https://example.com/a.git',
      pushUrl: 'https://example.com/a.git',
    });
    await expect(harness.client.addRemote({ absolutePath: root, name: 'origin', url: 'x' })).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });

    const updated = await harness.client.updateRemote({
      absolutePath: root,
      remote: 'origin',
      name: 'upstream',
      pushUrl: 'https://example.com/push.git',
    });
    expect(updated.remote).toMatchObject({
      name: 'upstream',
      fetchUrl: 'https://example.com/a.git',
      pushUrl: 'https://example.com/push.git',
    });
    await harness.client.addRemote({ absolutePath: root, name: 'alpha', url: 'https://example.com/b.git' });
    const { remotes } = await harness.client.getRemotes({ absolutePath: root });
    expect(remotes.map((remote) => remote.name)).toEqual(['alpha', 'upstream']);

    await harness.client.removeRemote({ absolutePath: root, name: 'alpha' });
    await expect(harness.client.removeRemote({ absolutePath: root, name: 'alpha' })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
  });
});

describe('transfers', () => {
  test('pushes, fetches and pulls from remote', async () => {
    const bare = await harness.bare('origin.git');
    await repo.run('remote', 'add', 'origin', bare);
    const first = await repo.commit('a.txt', 'a\n');
    await expect(collect(harness.client.push({ absolutePath: root })).ended).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION, // No upstream yet.
    });
    const push = collect(harness.client.push({ absolutePath: root, remote: 'origin', setUpstream: true }));
    await push.ended;
    const { branches } = await harness.client.getBranches({ absolutePath: root });
    expect(branches).toMatchObject([
      { name: 'main', upstream: 'origin/main' },
      { name: 'origin/main', remote: 'origin' },
    ]);

    const other = harness.open('other');
    await repo.run('clone', '--quiet', bare, other.nativeRoot);
    await other.run('config', 'user.name', 'Other');
    await other.run('config', 'user.email', 'other@example.com');
    const second = await other.commit('b.txt', 'b\n');
    await other.run('push', '--quiet', 'origin', 'main');

    const fetch = collect(harness.client.fetch({ absolutePath: root, remote: 'origin', prune: true }));
    await fetch.ended;
    await expect(harness.client.getStatus({ absolutePath: root })).resolves.toMatchObject({
      status: { ahead: 0, behind: 1 },
    });

    const pull = collect(harness.client.pull({ absolutePath: root, fastForward: FastForward.ONLY }));
    await pull.ended;
    expect(pull.seen.at(-1)?.event).toMatchObject({ case: 'result', value: { conflicted: false } });
    expect(await repo.run('rev-parse', 'HEAD')).toBe(second);
    expect(first).not.toBe(second);
  });

  test('reports progress and rejects a push the remote refuses', async () => {
    const bare = await harness.bare('origin.git');
    await repo.run('remote', 'add', 'origin', `file://${bare}`);
    await repo.commit('a.txt', 'a\n');
    const push = collect(
      harness.client.push({
        absolutePath: root,
        remote: 'origin',
        target: { case: 'branch', value: 'main' },
        setUpstream: true,
      }),
    );
    await push.ended;
    expect(push.seen.length).toBeGreaterThan(0);
    expect(push.seen.every((event) => event.event.case === 'progress')).toBe(true);

    const other = harness.open('other');
    await repo.run('clone', '--quiet', bare, other.nativeRoot);
    await other.run('config', 'user.name', 'Other');
    await other.run('config', 'user.email', 'other@example.com');
    await other.commit('b.txt', 'b\n');
    await other.run('push', '--quiet', 'origin', 'main');
    await repo.commit('c.txt', 'c\n');

    await expect(collect(harness.client.push({ absolutePath: root })).ended).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(
      collect(harness.client.push({ absolutePath: root, force: PushRequest_Force.WITH_LEASE })).ended,
    ).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION, // The last fetch did not see the other push.
    });
    await collect(harness.client.push({ absolutePath: root, force: PushRequest_Force.ALWAYS })).ended;
    expect(await other.run('ls-remote', '--heads', 'origin', 'main')).toContain(await repo.run('rev-parse', 'HEAD'));

    await repo.run('tag', 'v1');
    const tag = { case: 'tag', value: 'v1' } as const;
    await expect(collect(harness.client.push({ absolutePath: root, target: tag })).ended).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
    await collect(harness.client.push({ absolutePath: root, remote: 'origin', target: tag })).ended;
    expect(await other.run('ls-remote', '--tags', 'origin')).toContain('refs/tags/v1');
    await collect(harness.client.push({ absolutePath: root, remote: 'origin', target: tag, delete: true })).ended;
    expect(await other.run('ls-remote', '--tags', 'origin')).toBe('');

    await repo.run('branch', 'feature');
    const feature = { case: 'branch', value: 'feature' } as const;
    await collect(harness.client.push({ absolutePath: root, remote: 'origin', target: feature })).ended;
    await collect(harness.client.push({ absolutePath: root, remote: 'origin', target: feature, delete: true })).ended;
    expect(await other.run('ls-remote', '--heads', 'origin', 'feature')).toBe('');
  });

  test('stops a pull on conflicts and fails one with no upstream', async () => {
    await repo.commit('a.txt', 'a\n');
    await expect(collect(harness.client.pull({ absolutePath: root })).ended).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });

    const bare = await harness.bare('origin.git');
    await repo.run('remote', 'add', 'origin', bare);
    await repo.run('push', '--quiet', '--set-upstream', 'origin', 'main');
    const other = harness.open('other');
    await repo.run('clone', '--quiet', bare, other.nativeRoot);
    await other.run('config', 'user.name', 'Other');
    await other.run('config', 'user.email', 'other@example.com');
    await other.commit('a.txt', 'other\n');
    await other.run('push', '--quiet', 'origin', 'main');
    await repo.commit('a.txt', 'mine\n');

    const pull = collect(harness.client.pull({ absolutePath: root, mode: PullRequest_Mode.REBASE }));
    await pull.ended;
    expect(pull.seen.at(-1)?.event).toMatchObject({ case: 'result', value: { conflicted: true } });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.operation.case).toBe('rebase');
    await harness.client.abortOperation({ absolutePath: root });
  });

  test('ends the stream when a transfer is cancelled', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.run('remote', 'add', 'origin', 'https://127.0.0.1:9/nowhere.git');
    const abort = new AbortController();
    const { ended } = collect(harness.client.fetch({ absolutePath: root, remote: 'origin' }, { signal: abort.signal }));
    abort.abort();
    await expect(ended).rejects.toMatchObject({ code: Code.CANCELLED });
  });
});

describe('stashes', () => {
  test('pushes, lists, applies, pops and drops stashes', async () => {
    await repo.commit('a.txt', 'a\n');
    await expect(harness.client.pushStash({ absolutePath: root })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });

    await repo.write('a.txt', 'staged\n');
    await repo.run('add', 'a.txt');
    await repo.write('new.txt', 'new\n');
    const pushed = await harness.client.pushStash({
      absolutePath: root,
      message: 'work',
      scope: PushStashRequest_Scope.UNTRACKED,
    });
    expect(pushed.stash).toMatchObject({ index: 0, branch: 'main', message: 'work', untracked: true });
    expect(pushed.stash?.baseHash).toBe(await repo.run('rev-parse', 'HEAD'));
    await expect(harness.client.getStatus({ absolutePath: root })).resolves.toMatchObject({ status: { entries: [] } });

    await repo.write('b.txt', 'b\n');
    await harness.client.pushStash({
      absolutePath: root,
      scope: PushStashRequest_Scope.UNTRACKED,
      relativePaths: ['b.txt'],
    });
    const { stashes } = await harness.client.getStashes({ absolutePath: root });
    expect(stashes).toMatchObject([
      { index: 0, untracked: true },
      { index: 1, message: 'work' },
    ]);

    await expect(
      harness.client.applyStash({ absolutePath: root, index: 1, restoreIndex: true }),
    ).resolves.toMatchObject({
      conflicted: false,
    });
    let { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([
      { relativePath: 'a.txt', kind: { value: { staged: Change.MODIFIED } } },
      { relativePath: 'new.txt', kind: { case: 'untracked' } },
    ]);
    expect((await harness.client.getStashes({ absolutePath: root })).stashes).toHaveLength(2);

    await harness.client.dropStash({ absolutePath: root, index: 1 });
    await expect(harness.client.dropStash({ absolutePath: root, index: 5 })).rejects.toMatchObject({
      code: Code.FAILED_PRECONDITION,
    });
    await expect(harness.client.applyStash({ absolutePath: root, index: 0, drop: true })).resolves.toMatchObject({
      conflicted: false,
    });
    ({ status } = await harness.client.getStatus({ absolutePath: root }));
    expect(status?.entries.map((entry) => entry.relativePath)).toEqual(['a.txt', 'b.txt', 'new.txt']);
    expect((await harness.client.getStashes({ absolutePath: root })).stashes).toEqual([]);
  });

  test('keeps a stash that stops on conflicts', async () => {
    await repo.commit('a.txt', 'a\n');
    await repo.write('a.txt', 'stashed\n');
    await repo.run('stash', '--quiet');
    await repo.commit('a.txt', 'committed\n');
    await expect(harness.client.applyStash({ absolutePath: root, index: 0, drop: true })).resolves.toMatchObject({
      conflicted: true,
    });
    const { status } = await harness.client.getStatus({ absolutePath: root });
    expect(status?.entries).toMatchObject([{ relativePath: 'a.txt', kind: { case: 'conflicted' } }]);
    expect(status?.operation.case).toBeUndefined();
    expect((await harness.client.getStashes({ absolutePath: root })).stashes).toHaveLength(1);
  });
});

describe('identity', () => {
  test('returns and sets the identity for the repository and globally', async () => {
    await repo.run('config', '--unset', 'user.name');
    await repo.run('config', '--unset', 'user.email');
    await expect(harness.client.getIdentity({ absolutePath: root })).resolves.toMatchObject({ name: '', email: '' });

    await harness.client.setIdentity({
      absolutePath: root,
      name: 'Global',
      email: 'global@example.com',
      scope: SetIdentityRequest_Scope.GLOBAL,
    });
    await expect(harness.client.getIdentity({ absolutePath: root })).resolves.toMatchObject({
      name: 'Global',
      email: 'global@example.com',
    });
    await harness.client.setIdentity({ absolutePath: root, name: 'Local', email: 'local@example.com' });
    await expect(harness.client.getIdentity({ absolutePath: root })).resolves.toMatchObject({
      name: 'Local',
      email: 'local@example.com',
    });
    await expect(repo.run('config', '--global', 'user.name')).resolves.toBe('Global');
    await expect(harness.client.setIdentity({ absolutePath: root, name: '', email: '' })).rejects.toMatchObject({
      code: Code.INVALID_ARGUMENT,
    });
  });
});
