import fs from 'node:fs/promises';
import type { MessageInitShape } from '@bufbuild/protobuf';
import {
  Change,
  Status_Entry_Conflicted_Kind as Kind,
  type Status,
  type StatusSchema,
} from '../../gen/elsewise/daemon/git/v1/git_pb';
import type { Git } from '../git';

export type StatusInit = Exclude<MessageInitShape<typeof StatusSchema>, Status>;
type EntryInit = Exclude<StatusInit['entries'], undefined>[number];
export type OperationInit = Exclude<StatusInit['operation'], undefined>;

const OPERATION_FILES = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'];

const CHANGES: Record<string, Change> = {
  '.': Change.UNSPECIFIED,
  M: Change.MODIFIED,
  A: Change.ADDED,
  D: Change.DELETED,
  R: Change.RENAMED,
  C: Change.COPIED,
};

const CONFLICTS: Record<string, Kind> = {
  DD: Kind.BOTH_DELETED,
  AU: Kind.ADDED_BY_US,
  UD: Kind.DELETED_BY_THEM,
  UA: Kind.ADDED_BY_THEM,
  DU: Kind.DELETED_BY_US,
  AA: Kind.BOTH_ADDED,
  UU: Kind.BOTH_MODIFIED,
};

/** Reads the status of the worktree. */
export async function readStatus(git: Git, includeIgnored: boolean): Promise<StatusInit> {
  const args = ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'];
  if (includeIgnored) {
    args.push('--ignored=matching');
  }
  // The lock option keeps status from refreshing the index for performance reasons. The index will still run when
  // other git commands are called.
  const [output, operation] = await Promise.all([
    git.run(args, { env: { GIT_OPTIONAL_LOCKS: '0' } }),
    readOperation(git),
  ]);
  return { ...parseStatus(output.toString()), operation };
}

/** Parses `git status --porcelain=v2 --branch -z`. */
export function parseStatus(text: string): Omit<StatusInit, 'operation'> {
  const status: Omit<StatusInit, 'operation'> = {
    branch: '',
    hash: '',
    upstream: '',
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    entries: [],
  };
  const entries: EntryInit[] = [];
  let hasAheadBehind = false;

  const tokens = text.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    if (token === '') {
      continue;
    }
    switch (token[0]) {
      case '#': {
        const [, key, ...rest] = token.split(' ');
        const value = rest.join(' ');
        if (key === 'branch.oid') {
          status.hash = value === '(initial)' ? '' : value;
        } else if (key === 'branch.head') {
          status.branch = value === '(detached)' ? '' : value;
        } else if (key === 'branch.upstream') {
          status.upstream = value;
        } else if (key === 'branch.ab') {
          hasAheadBehind = true;
          const match = /^\+(\d+) -(\d+)$/.exec(value);
          status.ahead = Number(match?.[1] ?? 0);
          status.behind = Number(match?.[2] ?? 0);
        }
        break;
      }
      case '1': {
        const match = /^1 (\S)(\S) \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/s.exec(token);
        if (match) {
          entries.push(changed(match[3] as string, match[1] as string, match[2] as string, ''));
        }
        break;
      }
      case '2': {
        const match = /^2 (\S)(\S) \S+ \S+ \S+ \S+ \S+ \S+ [RC]\d+ (.*)$/s.exec(token);
        if (match) {
          i++;
          entries.push(changed(match[3] as string, match[1] as string, match[2] as string, tokens[i] ?? ''));
        }
        break;
      }
      case 'u': {
        const match = /^u (\S\S) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/s.exec(token);
        if (match) {
          const kind = CONFLICTS[match[1] as string] ?? Kind.OTHER;
          entries.push({ relativePath: match[2] as string, kind: { case: 'conflicted', value: { kind } } });
        }
        break;
      }
      case '?':
        entries.push({ relativePath: entryPath(token.slice(2)), kind: { case: 'untracked', value: {} } });
        break;
      case '!':
        entries.push({ relativePath: entryPath(token.slice(2)), kind: { case: 'ignored', value: {} } });
        break;
    }
  }

  status.upstreamGone = status.upstream !== '' && !hasAheadBehind;
  status.entries = entries;
  return status;
}

/** Reads the operation in progress. */
export async function readOperation(git: Git): Promise<OperationInit | undefined> {
  const args = ['rev-parse', '--path-format=absolute', ...OPERATION_FILES.flatMap((name) => ['--git-path', name])];
  const paths = (await git.text(args)).split('\n');
  const [rebaseMerge, rebaseApply, mergeHead, cherryPickHead, revertHead, bisectLog] = paths as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (await exists(rebaseMerge)) {
    return {
      case: 'rebase',
      value: {
        step: await readNumber(`${rebaseMerge}/msgnum`),
        total: await readNumber(`${rebaseMerge}/end`),
        hash: (await readFile(`${rebaseMerge}/stopped-sha`)) ?? '',
      },
    };
  }
  if (await exists(rebaseApply)) {
    return {
      case: 'rebase',
      value: {
        step: await readNumber(`${rebaseApply}/next`),
        total: await readNumber(`${rebaseApply}/last`),
        hash: (await readFile(`${rebaseApply}/original-commit`)) ?? '',
      },
    };
  }
  const merge = await readFile(mergeHead);
  if (merge !== undefined) {
    return { case: 'merge', value: { hashes: merge.split('\n').filter((hash) => hash !== '') } };
  }
  const cherryPick = await readFile(cherryPickHead);
  if (cherryPick !== undefined) {
    return { case: 'cherryPick', value: { hash: cherryPick } };
  }
  const revert = await readFile(revertHead);
  if (revert !== undefined) {
    return { case: 'revert', value: { hash: revert } };
  }
  if (await exists(bisectLog)) {
    return { case: 'other', value: {} };
  }
  return undefined;
}

/** Reads whether any staged entry is unmerged. */
export async function hasConflicts(git: Git): Promise<boolean> {
  return (await git.run(['ls-files', '--unmerged', '-z'])).length > 0;
}

function changed(relativePath: string, staged: string, unstaged: string, originalRelativePath: string): EntryInit {
  return {
    relativePath,
    kind: {
      case: 'changed',
      value: {
        staged: CHANGES[staged] ?? Change.OTHER,
        unstaged: CHANGES[unstaged] ?? Change.OTHER,
        originalRelativePath,
      },
    },
  };
}

function entryPath(relativePath: string): string {
  return relativePath.endsWith('/') ? relativePath.slice(0, -1) : relativePath;
}

async function exists(absoluteNativePath: string): Promise<boolean> {
  return fs.access(absoluteNativePath).then(
    () => true,
    () => false,
  );
}

async function readFile(absoluteNativePath: string): Promise<string | undefined> {
  return fs.readFile(absoluteNativePath, 'utf8').then(
    (content) => content.trim(),
    () => undefined,
  );
}

async function readNumber(absoluteNativePath: string): Promise<number> {
  return Number((await readFile(absoluteNativePath)) ?? 0) || 0;
}
