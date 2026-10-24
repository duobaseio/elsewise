import fs from 'node:fs/promises';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, TransportError } from '@elsewise/transport';
import { toProtocolPath } from '../../fs/path';
import type { WorktreeSchema } from '../../gen/elsewise/daemon/git/v1/git_pb';
import type { Git } from '../git';

export type WorktreeInit = MessageInitShape<typeof WorktreeSchema>;

const UNBORN = /^0+$/;

/** Reads every worktree of the repository. */
export async function readWorktrees(git: Git): Promise<WorktreeInit[]> {
  return parseWorktrees(await git.text(['worktree', 'list', '--porcelain', '-z']));
}

/** Reads the worktree at a native path. */
export async function readWorktree(git: Git, absoluteNativePath: string): Promise<WorktreeInit> {
  const wanted = await fs.realpath(absoluteNativePath).catch(() => absoluteNativePath);
  for (const worktree of await readWorktrees(git)) {
    const native = worktree.absolutePath ?? '';
    const resolved = await fs.realpath(native).catch(() => native);
    if (resolved === wanted) {
      return worktree;
    }
  }
  throw new TransportError(Code.NOT_FOUND, `${absoluteNativePath} is not a worktree of the repository`);
}

/** Parses `git worktree list --porcelain -z` output. */
export function parseWorktrees(text: string): WorktreeInit[] {
  const worktrees: WorktreeInit[] = [];
  for (const record of text.split('\0\0')) {
    if (record === '') {
      continue;
    }
    const worktree: WorktreeInit = {
      absolutePath: '',
      branch: '',
      hash: '',
      main: worktrees.length === 0,
      locked: false,
      lockReason: '',
      prunable: false,
    };
    for (const line of record.split('\0')) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const value = space === -1 ? '' : line.slice(space + 1);
      switch (key) {
        case 'worktree':
          worktree.absolutePath = toProtocolPath(value);
          break;
        case 'HEAD':
          worktree.hash = UNBORN.test(value) ? '' : value;
          break;
        case 'branch':
          worktree.branch = value.replace(/^refs\/heads\//, '');
          break;
        case 'locked':
          worktree.locked = true;
          worktree.lockReason = value;
          break;
        case 'prunable':
          worktree.prunable = true;
          break;
      }
    }
    worktrees.push(worktree);
  }
  return worktrees;
}
