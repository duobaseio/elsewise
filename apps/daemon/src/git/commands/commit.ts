import type { MessageInitShape } from '@bufbuild/protobuf';
import { Change, type CommitSchema } from '../../gen/elsewise/daemon/git/v1/git_pb';
import type { GetCommitResponse_EntrySchema } from '../../gen/elsewise/daemon/git/v1/git_service_pb';
import type { Git } from '../git';
import { identity, trimMessage } from './fields';

export type CommitInit = MessageInitShape<typeof CommitSchema>;
export type ChangedEntryInit = MessageInitShape<typeof GetCommitResponse_EntrySchema>;

const COMMIT_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%B';

const CHANGES: Record<string, Change> = {
  A: Change.ADDED,
  M: Change.MODIFIED,
  D: Change.DELETED,
  R: Change.RENAMED,
  C: Change.COPIED,
};

/** Returns a commit. */
export async function readCommit(git: Git, revision: string): Promise<CommitInit> {
  const [commit] = await readCommits(git, ['--max-count=1', revision, '--']);
  if (!commit) {
    throw new Error(`${revision} is not a commit`);
  }
  return commit;
}

/** Reads a page of the history of the revisions ( or HEAD). */
export async function readLog(
  git: Git,
  revisions: string[],
  pathspecs: string[],
  skip: number,
  limit: number,
): Promise<CommitInit[]> {
  // A bare `--` keeps a revision from being read as a path; a `.` pathspec would also simplify the history.
  return readCommits(git, [`--skip=${skip}`, `--max-count=${limit}`, ...revisions, '--', ...pathspecs]);
}

/** Returns the hash of the best common ancestor of two revisions or an empty string when they share no history. */
export async function readMergeBase(git: Git, revision: string, otherRevision: string): Promise<string> {
  return (await git.text(['merge-base', revision, otherRevision], { exitCodes: [0, 1] })).trim();
}

/** Parses `git log -z` output in `COMMIT_FORMAT`. */
export function parseCommits(text: string): CommitInit[] {
  return text
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const [hash, parents, authorName, authorEmail, authorTime, committerName, committerEmail, committerTime, body] =
        record.split('\x1f');
      return {
        hash: hash ?? '',
        parentHashes: parents ? parents.split(' ') : [],
        author: identity(authorName, authorEmail, authorTime),
        committer: identity(committerName, committerEmail, committerTime),
        message: trimMessage(body ?? ''),
      };
    });
}

/** Reads the entries a commit changed against its first parent. */
export async function readChangedEntries(git: Git, commit: CommitInit): Promise<ChangedEntryInit[]> {
  const args = ['diff-tree', '-r', '-z', '--name-status', '--find-renames', '--find-copies', '--no-commit-id'];
  const parent = commit.parentHashes?.[0];
  args.push(...(parent ? [parent, commit.hash as string] : ['--root', commit.hash as string]));
  return parseNameStatus(await git.text(args));
}

/** Parses `git diff-tree --name-status -z` output. */
export function parseNameStatus(text: string): ChangedEntryInit[] {
  const tokens = text.split('\0');
  const entries: ChangedEntryInit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    if (token === '') {
      continue;
    }
    const letter = token[0] as string;
    const relativePath = tokens[++i] ?? '';
    if (letter === 'R' || letter === 'C') {
      entries.push({ relativePath: tokens[++i] ?? '', originalRelativePath: relativePath, change: CHANGES[letter] });
    } else {
      entries.push({ relativePath, originalRelativePath: '', change: CHANGES[letter] ?? Change.OTHER });
    }
  }
  return entries;
}

async function readCommits(git: Git, args: string[]): Promise<CommitInit[]> {
  return parseCommits(await git.text(['log', `--format=${COMMIT_FORMAT}`, '-z', ...args]));
}
