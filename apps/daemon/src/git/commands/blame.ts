import type { MessageInitShape } from '@bufbuild/protobuf';
import type { GetBlameResponse_RangeSchema } from '../../gen/elsewise/daemon/git/v1/git_service_pb';
import type { Git } from '../git';
import { type IdentityInit, identity } from './fields';

export type RangeInit = MessageInitShape<typeof GetBlameResponse_RangeSchema>;

const UNCOMMITTED = /^0+$/;

interface CommitInfo {
  author: IdentityInit;
  summary: string;
  relativePath: string;
}

/** Reads the blame of a file at a revision (falls back to the worktree on disk). */
export async function readBlame(git: Git, revision: string, relativePath: string): Promise<RangeInit[]> {
  const args = ['blame', '--porcelain'];
  if (revision !== '') {
    args.push(revision);
  }
  return parseBlame(await git.text([...args, '--', relativePath]));
}

/** Parses `git blame --porcelain` output into ranges of consecutive lines. */
export function parseBlame(text: string): RangeInit[] {
  const ranges: RangeInit[] = [];
  const commits = new Map<string, CommitInfo>();
  const lines = text.split('\n');
  let range: RangeInit | undefined;
  let info: Partial<{ name: string; email: string; time: string }> & { summary?: string } = {};
  let hash = '';

  for (const line of lines) {
    if (line.startsWith('\t')) {
      continue;
    }
    const header = /^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/.exec(line);
    if (header) {
      if (header[4] !== undefined) {
        range = {
          line: Number(header[3]),
          lineCount: Number(header[4]),
          hash: UNCOMMITTED.test(header[1] as string) ? '' : (header[1] as string),
          summary: '',
          originalLine: 0,
          originalRelativePath: '',
        };
        hash = header[1] as string;
        info = {};
        const known = commits.get(hash);
        if (range.hash !== '') {
          range.originalLine = Number(header[2]);
          if (known) {
            range.author = known.author;
            range.summary = known.summary;
            range.originalRelativePath = known.relativePath;
          }
        }
        ranges.push(range);
      }
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    switch (key) {
      case 'author':
        info.name = value;
        break;
      case 'author-mail':
        info.email = value.replace(/^<|>$/g, '');
        break;
      case 'author-time':
        info.time = value;
        break;
      case 'summary':
        info.summary = value;
        break;
      case 'filename': {
        if (!range) {
          break;
        }
        let commit = commits.get(hash);
        if (!commit) {
          commit = {
            author: identity(info.name, info.email, info.time),
            summary: info.summary ?? '',
            relativePath: value,
          };
          commits.set(hash, commit);
        }
        if (range.hash !== '') {
          range.author = commit.author;
          range.summary = commit.summary;
          range.originalRelativePath = value;
        }
        break;
      }
    }
  }
  return ranges;
}
