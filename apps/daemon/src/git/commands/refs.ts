import type { MessageInitShape } from '@bufbuild/protobuf';
import { toProtocolPath } from '../../fs/path';
import type { BranchSchema, RemoteSchema, TagSchema } from '../../gen/elsewise/daemon/git/v1/git_pb';
import type { Git } from '../git';
import { identity, trimMessage } from './fields';

export type BranchInit = MessageInitShape<typeof BranchSchema>;
export type TagInit = MessageInitShape<typeof TagSchema>;
export type RemoteInit = MessageInitShape<typeof RemoteSchema>;

const SEPARATOR = '%1f';
const TERMINATOR = '%00';

const BRANCH_FORMAT =
  [
    '%(refname)',
    '%(refname:lstrip=2)',
    '%(symref)',
    '%(objectname)',
    '%(parent)',
    '%(authorname)',
    '%(authoremail:trim)',
    '%(authordate:unix)',
    '%(committername)',
    '%(committeremail:trim)',
    '%(committerdate:unix)',
    '%(upstream:lstrip=2)',
    '%(upstream:track,nobracket)',
    '%(worktreepath)',
    '%(contents)',
  ].join(SEPARATOR) + TERMINATOR;

const TAG_FORMAT =
  [
    '%(refname:lstrip=2)',
    '%(objecttype)',
    '%(objectname)',
    '%(*objectname)',
    '%(taggername)',
    '%(taggeremail:trim)',
    '%(taggerdate:unix)',
    '%(contents)',
  ].join(SEPARATOR) + TERMINATOR;

/** Returns the branches matching the patterns sorted by local followed by its name. */
export async function readBranches(git: Git, patterns = ['refs/heads', 'refs/remotes']): Promise<BranchInit[]> {
  const [text, remotes] = await Promise.all([
    git.text(['for-each-ref', `--format=${BRANCH_FORMAT}`, '--sort=refname', ...patterns]),
    readRemoteNames(git),
  ]);
  return parseBranches(text, remotes);
}

/** Returns a local branch. */
export async function readBranch(git: Git, name: string): Promise<BranchInit> {
  const [branch] = await readBranches(git, [`refs/heads/${name}`]);
  if (!branch) {
    throw new Error(`branch ${name} not found`);
  }
  return branch;
}

/** Whether a commit is checked out. */
export async function hasHead(git: Git): Promise<boolean> {
  return hasRef(git, 'HEAD');
}

/** Whether a local branch exists. */
export async function hasBranch(git: Git, name: string): Promise<boolean> {
  return hasRef(git, `refs/heads/${name}`);
}

/** Whether a ref exists. */
export async function hasRef(git: Git, name: string): Promise<boolean> {
  return (await git.run(['rev-parse', '--verify', '--quiet', name], { exitCodes: [0, 1] })).length > 0;
}

/** Parses `git for-each-ref` output in `BRANCH_FORMAT`. */
export function parseBranches(text: string, remotes: string[]): BranchInit[] {
  const branches: BranchInit[] = [];
  for (const record of records(text)) {
    const [
      refname,
      name,
      symref,
      hash,
      parents,
      authorName,
      authorEmail,
      authorTime,
      committerName,
      committerEmail,
      committerTime,
      upstream,
      track,
      worktreePath,
      message,
    ] = record;
    if (symref) {
      continue; // e.g. origin/HEAD
    }
    const remote = refname?.startsWith('refs/remotes/') ? remoteOf(name ?? '', remotes) : '';
    branches.push({
      name: name ?? '',
      remote,
      commit: {
        hash: hash ?? '',
        parentHashes: parents ? parents.split(' ') : [],
        author: identity(authorName, authorEmail, authorTime),
        committer: identity(committerName, committerEmail, committerTime),
        message: trimMessage(message ?? ''),
      },
      upstream: upstream ?? '',
      upstreamGone: track === 'gone',
      ahead: Number(/ahead (\d+)/.exec(track ?? '')?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track ?? '')?.[1] ?? 0),
      worktreeAbsolutePath: worktreePath ? toProtocolPath(worktreePath) : '',
    });
  }
  return branches;
}

/** Returns every tag sorted by name. */
export async function readTags(git: Git, patterns = ['refs/tags']): Promise<TagInit[]> {
  return parseTags(await git.text(['for-each-ref', `--format=${TAG_FORMAT}`, '--sort=refname', ...patterns]));
}

/** Returns one tag. */
export async function readTag(git: Git, name: string): Promise<TagInit> {
  const [tag] = await readTags(git, [`refs/tags/${name}`]);
  if (!tag) {
    throw new Error(`tag ${name} not found`);
  }
  return tag;
}

/** Parses `git for-each-ref` output in `TAG_FORMAT`. */
export function parseTags(text: string): TagInit[] {
  const tags: TagInit[] = [];
  for (const record of records(text)) {
    const [name, type, hash, peeled, taggerName, taggerEmail, taggerTime, message] = record;
    if (type === 'tag') {
      tags.push({
        name: name ?? '',
        hash: peeled ?? '',
        message: trimMessage(message ?? ''),
        tagger: identity(taggerName, taggerEmail, taggerTime),
      });
    } else {
      tags.push({ name: name ?? '', hash: hash ?? '', message: '' });
    }
  }
  return tags;
}

/** Returns every remote sorted by name. */
export async function readRemotes(git: Git): Promise<RemoteInit[]> {
  return parseRemotes(await git.text(['remote', '--verbose']));
}

/** Returns a remote. */
export async function readRemote(git: Git, name: string): Promise<RemoteInit> {
  const remote = (await readRemotes(git)).find((candidate) => candidate.name === name);
  if (!remote) {
    throw new Error(`remote ${name} not found`);
  }
  return remote;
}

/** Returns the remote of a branch's upstream. */
export async function upstreamRemote(git: Git, branch: string): Promise<string | undefined> {
  const remote = (await git.text(['config', '--get', `branch.${branch}.remote`], { exitCodes: [0, 1] })).trim();
  return remote === '' || remote === '.' ? undefined : remote;
}

/** Parses `git remote --verbose` output. */
export function parseRemotes(text: string): RemoteInit[] {
  const remotes = new Map<string, RemoteInit>();
  for (const line of text.split('\n')) {
    const match = /^(\S+)\t(.*) \((fetch|push)\)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, name, url, direction] = match as unknown as [string, string, string, string];
    const remote = remotes.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
    if (direction === 'fetch') {
      remote.fetchUrl = url;
    } else {
      remote.pushUrl = url;
    }
    remotes.set(name, remote);
  }
  return [...remotes.values()].sort((a, b) => ((a.name ?? '') < (b.name ?? '') ? -1 : 1));
}

async function readRemoteNames(git: Git): Promise<string[]> {
  return (await git.text(['remote'])).split('\n').filter((name) => name !== '');
}

/** Returns the remote a remote branch belongs to (e.g. `origin` for `origin/main`). */
function remoteOf(branch: string, remotes: string[]): string {
  let found = '';
  for (const remote of remotes) {
    if (branch.startsWith(`${remote}/`) && remote.length > found.length) {
      found = remote;
    }
  }
  return found || (branch.split('/')[0] as string);
}

function* records(text: string): Generator<string[]> {
  for (const record of text.split('\0')) {
    if (record.trim() !== '') {
      yield record.replace(/^\n+/, '').split('\x1f');
    }
  }
}
