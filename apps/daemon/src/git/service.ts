import fs from 'node:fs/promises';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, type HandlerContext, type ServiceImpl, TransportError } from '@elsewise/transport';
import type { DirectoryWatcher } from '../directory-watcher';
import { errnoOf } from '../fs/error';
import { isBinary } from '../fs/file';
import { toNativeRoot } from '../fs/path';
import { FastForward } from '../gen/elsewise/daemon/git/v1/git_pb';
import {
  type AbortOperationRequest,
  type AddRemoteRequest,
  type AddWorktreeRequest,
  type ApplyStashRequest,
  type CheckoutRequest,
  type CherryPickRequest,
  type CommitRequest,
  type ContinueOperationRequest,
  type CreateBranchRequest,
  type CreateTagRequest,
  type DeleteBranchRequest,
  type DeleteTagRequest,
  type DiscardRequest,
  type DropStashRequest,
  type FetchRequest,
  type FetchResponseSchema,
  type GetBlameRequest,
  type GetBranchesRequest,
  type GetCommitRequest,
  type GetDiffRequest,
  type GetIdentityRequest,
  type GetLogRequest,
  type GetRemotesRequest,
  type GetStashesRequest,
  type GetStatusRequest,
  type GetTagsRequest,
  type GetWorktreesRequest,
  type GitService,
  type LockWorktreeRequest,
  type MergeRequest,
  type MoveWorktreeRequest,
  type PruneWorktreesRequest,
  type PullRequest,
  PullRequest_Mode,
  type PullResponseSchema,
  type PushRequest,
  PushRequest_Force,
  type PushResponseSchema,
  type PushStashRequest,
  PushStashRequest_Scope,
  type ReadFileAtRevisionRequest,
  type RebaseRequest,
  type RemoveRemoteRequest,
  type RemoveWorktreeRequest,
  type RenameBranchRequest,
  type ResetRequest,
  ResetRequest_Mode,
  type ResolveConflictsRequest,
  ResolveConflictsRequest_Side,
  type RestoreRequest,
  type RevertRequest,
  type SetBranchUpstreamRequest,
  type SetIdentityRequest,
  SetIdentityRequest_Scope,
  type SkipOperationRequest,
  type StageRequest,
  type UnlockWorktreeRequest,
  type UnstageRequest,
  type UpdateRemoteRequest,
  type WatchStatusRequest,
} from '../gen/elsewise/daemon/git/v1/git_service_pb';
import {
  filePath,
  guardOperand,
  guardRefName,
  mainline,
  pathspecs,
  revisionOrHead,
  revisions,
  withPathspecs,
} from './args';
import { readBlame } from './commands/blame';
import { readChangedEntries, readCommit, readLog } from './commands/commit';
import type { ProgressInit } from './commands/progress';
import {
  hasBranch,
  hasHead,
  hasRef,
  readBranch,
  readBranches,
  readRemote,
  readRemotes,
  readTag,
  readTags,
  upstreamRemote,
} from './commands/refs';
import { readStashes } from './commands/stash';
import { hasConflicts, readOperation, readStatus } from './commands/status';
import { readWorktree, readWorktrees } from './commands/worktree';
import { attempt, gitToTransportError } from './error';
import { Git } from './git';
import { transfer } from './transfer';
import { watchStatus } from './watch';

type FetchEvent = MessageInitShape<typeof FetchResponseSchema>;
type PullEvent = MessageInitShape<typeof PullResponseSchema>;
type PushEvent = MessageInitShape<typeof PushResponseSchema>;

export interface GitOptions {
  /** The size in bytes past which the output of a git command fails the call. */
  readLimitBytes: number;

  /** The most commits a page of the log holds. */
  logLimit: number;

  /** How often a watched status is read again regardless of notified changes in milliseconds. */
  pollIntervalMs: number;

  /** How long notified changes are debounced in milliseconds. */
  debounceMs: number;
}

const RESET_MODES: Partial<Record<ResetRequest_Mode, string>> = {
  [ResetRequest_Mode.SOFT]: '--soft',
  [ResetRequest_Mode.MIXED]: '--mixed',
  [ResetRequest_Mode.HARD]: '--hard',
};

const FAST_FORWARDS: Record<FastForward, string> = {
  [FastForward.UNSPECIFIED]: '--ff',
  [FastForward.NEVER]: '--no-ff',
  [FastForward.ONLY]: '--ff-only',
};

/** The `GitService`. */
export class GitServiceImpl implements ServiceImpl<typeof GitService> {
  readonly #watcher: DirectoryWatcher;
  readonly #options: GitOptions;

  constructor(watcher: DirectoryWatcher, options: GitOptions) {
    this.#watcher = watcher;
    this.#options = options;
  }

  getStatus(request: GetStatusRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { status: await readStatus(git, request.includeIgnored) };
    });
  }

  async *watchStatus(request: WatchStatusRequest, { signal }: HandlerContext) {
    try {
      const git = await this.#open(request.absolutePath);
      const statuses = watchStatus(git, signal, {
        watcher: this.#watcher,
        pollIntervalMs: this.#options.pollIntervalMs,
        debounceMs: this.#options.debounceMs,
        read: () => readStatus(git, request.includeIgnored),
      });
      for await (const status of statuses) {
        yield { status };
      }
    } catch (error) {
      throw gitToTransportError(error);
    }
  }

  stage(request: StageRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      await git.run(withPathspecs(['add', '--all'], pathspecs(request.relativePaths)));
      return {};
    });
  }

  unstage(request: UnstageRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      await git.run(withPathspecs(['reset', '--quiet'], pathspecs(request.relativePaths)));
      return {};
    });
  }

  discard(request: DiscardRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const pathSpecs = pathspecs(request.relativePaths);
      // Only tracked entries can be restored. Clean removes untracked files after.
      const tracked = (await git.text(withPathspecs(['ls-files', '-z'], pathSpecs)))
        .split('\0')
        .filter((p) => p !== '');
      if (tracked.length > 0) {
        await runWithStdinPaths(git, ['restore', '--worktree'], tracked);
      }
      await git.run(withPathspecs(['clean', '--force', '-d', '--quiet'], pathSpecs));
      return {};
    });
  }

  restore(request: RestoreRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const source = `--source=${revisionOrHead(request.revision)}`;
      const args = ['restore', source, '--staged', '--worktree'];
      await git.run(withPathspecs(args, pathspecs(request.relativePaths)));
      return {};
    });
  }

  getDiff(request: GetDiffRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['diff', '--no-color', '--no-ext-diff'];
      switch (request.target.case) {
        case 'unstaged':
          break;
        case 'staged':
          args.push('--cached');
          break;
        case 'revisions': {
          const { fromRevision, toRevision } = request.target.value;
          args.push(guardOperand(fromRevision, 'revision'));
          if (toRevision !== '') {
            args.push(guardOperand(toRevision, 'revision'));
          }
          break;
        }
        default:
          throw new TransportError(Code.INVALID_ARGUMENT, 'the diff needs a target');
      }
      const pathSpecs = pathspecs(request.relativePaths);
      const patch = await git.run(withPathspecs(args, pathSpecs));
      return { patch };
    });
  }

  readFileAtRevision(request: ReadFileAtRevisionRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const revision = request.revision === '' ? '' : guardOperand(request.revision, 'revision');
      const object = `${revision}:${filePath(request.relativePath)}`;
      const content = await git.run(['cat-file', 'blob', object]);
      return { binary: isBinary(content), content };
    });
  }

  getBlame(request: GetBlameRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const revision = request.revision === '' ? '' : guardOperand(request.revision, 'revision');
      return { ranges: await readBlame(git, revision, filePath(request.relativePath)) };
    });
  }

  commit(request: CommitRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      if (request.message === '' && !request.amend) {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the message must not be empty');
      }
      const args = ['commit', '--quiet'];
      if (request.amend) {
        args.push('--amend');
      }
      args.push(request.message === '' ? '--no-edit' : `--message=${request.message}`);
      await git.run(args);
      return { commit: await readCommit(git, 'HEAD') };
    });
  }

  getLog(request: GetLogRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const limit = request.limit === 0 ? this.#options.logLimit : Math.min(request.limit, this.#options.logLimit);
      const revisions = request.revisions.map((revision) => guardOperand(revision, 'revision'));
      const pathSpecs = pathspecs(request.relativePaths);
      if (revisions.length === 0 && !(await hasHead(git))) {
        return { commits: [] }; // No commits yet is an empty history which causes git to throw an error.
      }
      return { commits: await readLog(git, revisions, pathSpecs, request.skip, limit) };
    });
  }

  getCommit(request: GetCommitRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const commit = await readCommit(git, guardOperand(request.revision, 'revision'));
      return { commit, entries: await readChangedEntries(git, commit) };
    });
  }

  reset(request: ResetRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const mode = RESET_MODES[request.mode];
      if (mode === undefined) {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the reset needs a mode');
      }
      await git.run(['reset', mode, '--quiet', revisionOrHead(request.revision)]);
      return {};
    });
  }

  getBranches(request: GetBranchesRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { branches: await readBranches(git) };
    });
  }

  createBranch(request: CreateBranchRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const name = guardOperand(request.name, 'branch name');
      const revision = revisionOrHead(request.revision);
      await refuseExistingBranch(git, name);
      if (request.checkout) {
        await git.run(['switch', '--create', name, revision]);
      } else {
        await git.run(['branch', name, revision]);
      }
      return { branch: await readBranch(git, name) };
    });
  }

  renameBranch(request: RenameBranchRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const newName = guardOperand(request.newName, 'branch name');
      await refuseExistingBranch(git, newName);
      await git.run(['branch', '--move', guardOperand(request.name, 'branch name'), newName]);
      return { branch: await readBranch(git, newName) };
    });
  }

  setBranchUpstream(request: SetBranchUpstreamRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const name = request.branch === '' ? await currentBranch(git) : guardOperand(request.branch, 'branch name');
      if (request.upstream === '') {
        if ((await readBranch(git, name)).upstream !== '') {
          await git.run(['branch', '--unset-upstream', name]);
        }
      } else {
        await git.run(['branch', `--set-upstream-to=${guardOperand(request.upstream, 'upstream')}`, name]);
      }
      return { branch: await readBranch(git, name) };
    });
  }

  deleteBranch(request: DeleteBranchRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['branch', '--delete'];
      if (request.force) {
        args.push('--force');
      }
      await git.run([...args, guardOperand(request.name, 'branch name')]);
      return {};
    });
  }

  checkout(request: CheckoutRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      switch (request.target.case) {
        case 'branch':
          await git.run(['switch', guardOperand(request.target.value, 'branch name')]);
          break;
        case 'revision':
          await git.run(['switch', '--detach', guardOperand(request.target.value, 'revision')]);
          break;
        default:
          throw new TransportError(Code.INVALID_ARGUMENT, 'the checkout needs a target');
      }
      return {};
    });
  }

  getWorktrees(request: GetWorktreesRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { worktrees: await readWorktrees(git) };
    });
  }

  addWorktree(request: AddWorktreeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const newPath = toNativeRoot(request.newAbsolutePath);
      await refuseOccupiedPath(newPath, 'empty');
      const args = ['worktree', 'add'];
      if (request.branch === '') {
        args.push('--detach', newPath, revisionOrHead(request.revision));
      } else {
        const branch = guardOperand(request.branch, 'branch name');
        if (await hasBranch(git, branch)) {
          if (request.revision !== '') {
            throw new TransportError(Code.FAILED_PRECONDITION, `branch ${branch} already exists`);
          }
          args.push(newPath, branch);
        } else {
          args.push('-b', branch, newPath, revisionOrHead(request.revision));
        }
      }
      await git.run(args);
      return { worktree: await readWorktree(git, newPath) };
    });
  }

  moveWorktree(request: MoveWorktreeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const newPath = toNativeRoot(request.newAbsolutePath);
      const worktree = toNativeRoot(request.worktreeAbsolutePath);
      await refuseMainWorktree(git, worktree);
      await refuseOccupiedPath(newPath, 'missing');
      await git.run(['worktree', 'move', worktree, newPath]);
      return { worktree: await readWorktree(git, newPath) };
    });
  }

  lockWorktree(request: LockWorktreeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const worktreePath = toNativeRoot(request.worktreeAbsolutePath);
      await refuseMainWorktree(git, worktreePath);
      const args = ['worktree', 'lock'];
      if (request.reason !== '') {
        args.push(`--reason=${request.reason}`);
      }
      await git.run([...args, worktreePath]);
      return { worktree: await readWorktree(git, worktreePath) };
    });
  }

  unlockWorktree(request: UnlockWorktreeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const worktreePath = toNativeRoot(request.worktreeAbsolutePath);
      await git.run(['worktree', 'unlock', worktreePath]);
      return { worktree: await readWorktree(git, worktreePath) };
    });
  }

  removeWorktree(request: RemoveWorktreeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const worktree = toNativeRoot(request.worktreeAbsolutePath);
      await refuseMainWorktree(git, worktree);
      const args = ['worktree', 'remove'];
      if (request.force) {
        args.push('--force');
      }
      await git.run([...args, worktree]);
      return {};
    });
  }

  pruneWorktrees(request: PruneWorktreesRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const prunable = (await readWorktrees(git)).filter((worktree) => worktree.prunable);
      await git.run(['worktree', 'prune']);
      return { prunedAbsolutePaths: prunable.map((worktree) => worktree.absolutePath as string) };
    });
  }

  getTags(request: GetTagsRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { tags: await readTags(git) };
    });
  }

  createTag(request: CreateTagRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const name = guardOperand(request.name, 'tag name');
      if (await hasRef(git, `refs/tags/${name}`)) {
        throw new TransportError(Code.ALREADY_EXISTS, `tag ${name} already exists`);
      }
      const args = ['tag'];
      if (request.message !== '') {
        args.push('--annotate', `--message=${request.message}`);
      }
      await git.run([...args, name, revisionOrHead(request.revision)]);
      return { tag: await readTag(git, name) };
    });
  }

  deleteTag(request: DeleteTagRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      await git.run(['tag', '--delete', guardOperand(request.name, 'tag name')]);
      return {};
    });
  }

  merge(request: MergeRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['merge', '--no-edit'];
      args.push(request.squash ? '--squash' : (FAST_FORWARDS[request.fastForward] ?? '--ff'));
      return { conflicted: await runStoppingOnConflicts(git, [...args, guardOperand(request.revision, 'revision')]) };
    });
  }

  rebase(request: RebaseRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['rebase'];
      if (request.rebaseMerges) {
        args.push('--rebase-merges');
      }
      return { conflicted: await runStoppingOnConflicts(git, [...args, guardOperand(request.revision, 'revision')]) };
    });
  }

  cherryPick(request: CherryPickRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['cherry-pick', ...mainline(request.mainline), ...revisions(request.revisions)];
      return { conflicted: await runStoppingOnConflicts(git, args) };
    });
  }

  revert(request: RevertRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['revert', '--no-edit', ...mainline(request.mainline), ...revisions(request.revisions)];
      return { conflicted: await runStoppingOnConflicts(git, args) };
    });
  }

  continueOperation(request: ContinueOperationRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const command = await operationCommand(git, 'continue');
      if (await hasConflicts(git)) {
        throw new TransportError(Code.FAILED_PRECONDITION, 'a conflict is still unresolved');
      }
      return { conflicted: await runStoppingOnConflicts(git, [command, '--continue']) };
    });
  }

  skipOperation(request: SkipOperationRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const command = await operationCommand(git, 'skip');
      return { conflicted: await runStoppingOnConflicts(git, [command, '--skip']) };
    });
  }

  abortOperation(request: AbortOperationRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const command = await operationCommand(git, 'abort');
      await git.run([command, '--abort']);
      return {};
    });
  }

  resolveConflicts(request: ResolveConflictsRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      let side: '--ours' | '--theirs';
      let stage: '2' | '3';
      switch (request.side) {
        case ResolveConflictsRequest_Side.OURS:
          [side, stage] = ['--ours', '2'];
          break;
        case ResolveConflictsRequest_Side.THEIRS:
          [side, stage] = ['--theirs', '3'];
          break;
        default:
          throw new TransportError(Code.INVALID_ARGUMENT, 'the resolution needs a side');
      }

      /** Entries the chosen side has get `checkout <side>` and `add`. Entries it deleted gets `rm` because `checkout
       * <side>` fails. See example below:
       *
       *   $ git ls-files --unmerged
       *   100644 587be6b… 1 f.txt
       *   100644 975fbec… 3 f.txt
       *   $ git checkout --ours f.txt
       *   error: path 'f.txt' does not have our version
       */
      const pathSpecs = pathspecs(request.relativePaths);
      const stages = new Map<string, Set<string>>();
      for (const line of (await git.text(withPathspecs(['ls-files', '--unmerged', '-z'], pathSpecs))).split('\0')) {
        const match = /^\S+ \S+ (\d)\t(.*)$/s.exec(line);
        if (match) {
          const [, entryStage, relativePath] = match as unknown as [string, string, string];
          const entryStages = stages.get(relativePath) ?? new Set<string>();
          entryStages.add(entryStage);
          stages.set(relativePath, entryStages);
        }
      }
      const kept: string[] = [];
      const removed: string[] = [];
      for (const [relativePath, entryStages] of stages) {
        (entryStages.has(stage) ? kept : removed).push(relativePath);
      }
      if (kept.length > 0) {
        await runWithStdinPaths(git, ['checkout', side], kept);
        await runWithStdinPaths(git, ['add'], kept);
      }
      if (removed.length > 0) {
        await runWithStdinPaths(git, ['rm', '--quiet'], removed);
      }
      return {};
    });
  }

  getRemotes(request: GetRemotesRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { remotes: await readRemotes(git) };
    });
  }

  addRemote(request: AddRemoteRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const name = guardOperand(request.name, 'remote name');
      await refuseExistingRemote(git, name);
      await git.run(['remote', 'add', name, guardOperand(request.url, 'url')]);
      return { remote: await readRemote(git, name) };
    });
  }

  updateRemote(request: UpdateRemoteRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      let name = guardOperand(request.remote, 'remote name');
      if (request.name !== '' && request.name !== name) {
        await refuseExistingRemote(git, guardOperand(request.name, 'remote name'));
        await git.run(['remote', 'rename', name, request.name]);
        name = request.name;
      }
      if (request.fetchUrl !== '') {
        await git.run(['remote', 'set-url', name, guardOperand(request.fetchUrl, 'url')]);
      }
      if (request.pushUrl !== '') {
        await git.run(['remote', 'set-url', '--push', name, guardOperand(request.pushUrl, 'url')]);
      }
      return { remote: await readRemote(git, name) };
    });
  }

  removeRemote(request: RemoveRemoteRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      await git.run(['remote', 'remove', guardOperand(request.name, 'remote name')]);
      return {};
    });
  }

  async *fetch(request: FetchRequest, { signal }: HandlerContext): AsyncGenerator<FetchEvent> {
    const git = await attempt(() => this.#open(request.absolutePath));
    const args = ['fetch', '--progress'];
    if (request.prune) {
      args.push('--prune');
    }
    args.push(request.remote === '' ? '--all' : guardOperand(request.remote, 'remote name'));
    yield* progressEvents(git, args, signal);
  }

  async *pull(request: PullRequest, { signal }: HandlerContext): AsyncGenerator<PullEvent> {
    const git = await attempt(() => this.#open(request.absolutePath));
    const args = ['pull', '--progress', '--no-edit'];
    switch (request.mode) {
      case PullRequest_Mode.REBASE:
        args.push('--rebase');
        break;
      case PullRequest_Mode.REBASE_MERGES:
        args.push('--rebase=merges');
        break;
      default:
        args.push('--no-rebase', FAST_FORWARDS[request.fastForward] ?? '--ff');
    }
    if (request.remote !== '') {
      args.push(guardOperand(request.remote, 'remote name'));
      if (request.branch !== '') {
        args.push(guardOperand(request.branch, 'branch name'));
      }
    } else if (request.branch !== '') {
      throw new TransportError(Code.INVALID_ARGUMENT, 'a branch needs a remote');
    }
    let conflicted = false;
    try {
      yield* progressEvents(git, args, signal);
    } catch (failure) {
      conflicted = await attempt(() => hasConflicts(git));
      if (!conflicted) {
        throw failure;
      }
    }
    yield { event: { case: 'result', value: { conflicted } } };
  }

  async *push(request: PushRequest, { signal }: HandlerContext): AsyncGenerator<PushEvent> {
    const git = await attempt(() => this.#open(request.absolutePath));
    const args = ['push', '--progress'];
    let refspec: string;
    let remote: string;
    if (request.target.case === 'tag') {
      // Push a tag.
      refspec = `refs/tags/${guardRefName(request.target.value, 'tag name')}`;
      if (request.remote === '') {
        throw new TransportError(Code.INVALID_ARGUMENT, 'pushing a tag needs a remote');
      }
      remote = guardOperand(request.remote, 'remote name');
    } else {
      // Push or delete a branch.
      const branch =
        request.target.case === 'branch'
          ? guardRefName(request.target.value, 'branch name')
          : await attempt(() => currentBranch(git));
      refspec = `refs/heads/${branch}`;
      if (request.remote !== '') {
        remote = guardOperand(request.remote, 'remote name');
      } else {
        const upstream = await attempt(() => upstreamRemote(git, branch));
        if (upstream === undefined) {
          throw new TransportError(
            Code.FAILED_PRECONDITION,
            `${branch} has no upstream, as such the push needs a remote`,
          );
        }
        remote = upstream;
      }
      if (request.setUpstream && !request.delete) {
        args.push('--set-upstream');
      }
    }
    if (request.delete) {
      args.push('--delete');
    } else if (request.force === PushRequest_Force.WITH_LEASE) {
      args.push('--force-with-lease');
    } else if (request.force === PushRequest_Force.ALWAYS) {
      args.push('--force');
    }
    yield* progressEvents(git, [...args, remote, refspec], signal);
  }

  getStashes(request: GetStashesRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      return { stashes: await readStashes(git) };
    });
  }

  pushStash(request: PushStashRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['stash', 'push'];
      if (request.message !== '') {
        args.push(`--message=${request.message}`);
      }
      if (request.scope === PushStashRequest_Scope.UNTRACKED) {
        args.push('--include-untracked');
      } else if (request.scope === PushStashRequest_Scope.ALL) {
        args.push('--all');
      }
      const pathSpecs = pathspecs(request.relativePaths);
      const output = await git.text(withPathspecs(args, pathSpecs.length > 0 ? pathSpecs : undefined));
      if (/no local changes to save/i.test(output)) {
        throw new TransportError(Code.FAILED_PRECONDITION, 'there is nothing to stash');
      }
      const [stash] = await readStashes(git);
      if (!stash) {
        throw new TransportError(Code.INTERNAL, 'the stash was not created');
      }
      return { stash };
    });
  }

  applyStash(request: ApplyStashRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const args = ['stash', request.drop ? 'pop' : 'apply'];
      if (request.restoreIndex) {
        args.push('--index');
      }
      return { conflicted: await runStoppingOnConflicts(git, [...args, `stash@{${request.index}}`]) };
    });
  }

  dropStash(request: DropStashRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      await git.run(['stash', 'drop', '--quiet', `stash@{${request.index}}`]);
      return {};
    });
  }

  getIdentity(request: GetIdentityRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      const [name, email] = await Promise.all([
        git.text(['config', '--get', 'user.name'], { exitCodes: [0, 1] }),
        git.text(['config', '--get', 'user.email'], { exitCodes: [0, 1] }),
      ]);
      return { name: name.trim(), email: email.trim() };
    });
  }

  setIdentity(request: SetIdentityRequest) {
    return attempt(async () => {
      const git = await this.#open(request.absolutePath);
      if (request.name === '' || request.email === '') {
        throw new TransportError(Code.INVALID_ARGUMENT, 'the name and the email must not be empty');
      }
      const args = ['config'];
      if (request.scope === SetIdentityRequest_Scope.GLOBAL) {
        args.push('--global');
      }
      await git.run([...args, 'user.name', request.name]);
      await git.run([...args, 'user.email', request.email]);
      return {};
    });
  }

  /** Returns git running in the worktree. */
  async #open(absolutePath: string): Promise<Git> {
    const absoluteNativePath = toNativeRoot(absolutePath);
    const stats = await fs.stat(absoluteNativePath);
    if (!stats.isDirectory()) {
      throw new TransportError(Code.FAILED_PRECONDITION, 'the path is not a directory');
    }
    return new Git(absoluteNativePath, this.#options.readLimitBytes);
  }
}

/** Runs a transfer and yields its progress as events. */
async function* progressEvents(
  git: Git,
  args: string[],
  signal: AbortSignal,
): AsyncGenerator<{ event: { case: 'progress'; value: ProgressInit } }> {
  for await (const progress of transfer(git, args, signal)) {
    yield { event: { case: 'progress', value: progress } };
  }
}

/** Runs a command that may stop on conflicts. Returns if a conflict occurred. */
async function runStoppingOnConflicts(git: Git, args: string[]): Promise<boolean> {
  let failure: TransportError | undefined;
  await git.run(args).catch((error: TransportError) => {
    failure = error;
  });
  const conflicted = await hasConflicts(git);
  if (failure && !conflicted) {
    throw failure;
  }
  return conflicted;
}

/**
 * Runs a command over relative paths passed through stdin.
 *
 * This allows for more paths to be passed into the command as there is an command line limit (varies across OSes).
 */
async function runWithStdinPaths(git: Git, args: string[], relativePaths: string[]): Promise<void> {
  const stdin = relativePaths.map((relativePath) => `:(literal)${relativePath}`).join('\0');
  await git.run([...args, '--pathspec-from-file=-', '--pathspec-file-nul'], { stdin });
}

async function refuseExistingBranch(git: Git, name: string): Promise<void> {
  if (await hasBranch(git, name)) {
    throw new TransportError(Code.ALREADY_EXISTS, `branch ${name} already exists`);
  }
}

async function refuseExistingRemote(git: Git, name: string): Promise<void> {
  if ((await readRemotes(git)).some((remote) => remote.name === name)) {
    throw new TransportError(Code.ALREADY_EXISTS, `remote ${name} already exists`);
  }
}

async function refuseOccupiedPath(absoluteNativePath: string, acceptable: 'empty' | 'missing'): Promise<void> {
  const entries = await fs.readdir(absoluteNativePath).catch((error: unknown) => {
    if (errnoOf(error) === 'ENOENT') {
      return undefined;
    }
    return ['?']; // Unknown error occurred.
  });
  if (entries !== undefined && (acceptable === 'missing' || entries.length > 0)) {
    throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the path');
  }
}

async function refuseMainWorktree(git: Git, absoluteNativePath: string): Promise<void> {
  if ((await readWorktree(git, absoluteNativePath)).main) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'the main worktree cannot be changed');
  }
}

async function currentBranch(git: Git): Promise<string> {
  const name = (await git.text(['symbolic-ref', '--quiet', '--short', 'HEAD'], { exitCodes: [0, 1] })).trim();
  if (name === '') {
    throw new TransportError(Code.FAILED_PRECONDITION, 'no branch is checked out');
  }
  return name;
}

/** Returns the command of the operation in progress. */
async function operationCommand(git: Git, action: 'continue' | 'skip' | 'abort'): Promise<string> {
  const operation = await readOperation(git);
  switch (operation?.case) {
    case 'rebase':
      return 'rebase';
    case 'merge':
      if (action === 'skip') {
        throw new TransportError(Code.FAILED_PRECONDITION, 'a merge cannot be skipped');
      }
      return 'merge';
    case 'cherryPick':
      return 'cherry-pick';
    case 'revert':
      return 'revert';
    case 'other':
      throw new TransportError(Code.FAILED_PRECONDITION, 'the operation in progress is not supported');
    default:
      throw new TransportError(Code.FAILED_PRECONDITION, 'no operation is in progress');
  }
}
