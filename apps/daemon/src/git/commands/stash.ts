import type { MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import type { StashSchema } from '../../gen/elsewise/daemon/git/v1/git_pb';
import type { Git } from '../git';

export type StashInit = MessageInitShape<typeof StashSchema>;

const STASH_FORMAT = '%H%x1f%P%x1f%ct%x1f%s%x00';

/** Returns every stash sorted by newest to oldest. */
export async function readStashes(git: Git): Promise<StashInit[]> {
  return parseStashes(await git.text(['stash', 'list', `--format=${STASH_FORMAT}`]));
}

/** Parses `git stash list` output in `STASH_FORMAT`. */
export function parseStashes(text: string): StashInit[] {
  const stashes: StashInit[] = [];
  for (const record of text.split('\0')) {
    if (record.trim() === '') {
      continue;
    }
    const [hash, parents, seconds, subject] = record.replace(/^\n+/, '').split('\x1f');
    const parentHashes = parents ? parents.split(' ') : [];
    const match = /^(?:WIP on|On) (.+?): (.*)$/s.exec(subject ?? '');
    const branch = match?.[1] ?? '';
    stashes.push({
      index: stashes.length,
      hash: hash ?? '',
      branch: branch === '(no branch)' ? '' : branch,
      baseHash: parentHashes[0] ?? '',
      message: match?.[2] ?? subject ?? '',
      time: timestampFromMs(Number(seconds ?? 0) * 1000),
      untracked: parentHashes.length > 2,
    });
  }
  return stashes;
}
