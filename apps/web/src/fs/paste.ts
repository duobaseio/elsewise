import type { Workspace } from '@elsewise/frontend-plugin';
import type { Daemon } from '@/daemon';
import {
  CopyEntriesResponse_Failure_Reason as CopyReason,
  MoveEntriesResponse_Failure_Reason as MoveEntriesReason,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { MoveResponse_Failure_Reason as MoveReason } from '@/gen/elsewise/daemon/git/v1/git_service_pb';

/**
 * An entry to paste, relative to its workspace without a trailing `/`.
 */
export interface PasteEntry {
  readonly source: string;
  readonly destination: string;
  readonly folder: boolean;
}

/**
 * Moves `entries` if `cut`, through git in a git workspace, or copies them otherwise, in one request. Returns those
 * whose destination exists and those that failed otherwise.
 */
export async function pasteEntries(
  daemon: Daemon,
  workspace: Workspace,
  cut: boolean,
  entries: readonly PasteEntry[],
  overwrite: boolean,
): Promise<{ conflicting: PasteEntry[]; failures: { entry: PasteEntry; error: Error }[] }> {
  const request = {
    entries: entries.map((entry) => ({ relativePath: entry.source, newRelativePath: entry.destination })),
    overwrite,
  };
  const failures = !cut
    ? (await daemon.fileSystem.copyEntries({ root: workspace.absolutePath, ...request })).failures.map((failure) => ({
        ...failure,
        exists: failure.reason === CopyReason.ALREADY_EXISTS,
      }))
    : workspace.state === 'ok' || workspace.state === 'detached'
      ? (await daemon.git.move({ absolutePath: workspace.absolutePath, ...request })).failures.map((failure) => ({
          ...failure,
          exists: failure.reason === MoveReason.ALREADY_EXISTS,
        }))
      : (await daemon.fileSystem.moveEntries({ root: workspace.absolutePath, ...request })).failures.map((failure) => ({
          ...failure,
          exists: failure.reason === MoveEntriesReason.ALREADY_EXISTS,
        }));

  return {
    conflicting: entries.filter((entry) =>
      failures.some((failure) => failure.exists && failure.relativePath === entry.source),
    ),
    failures: entries.flatMap((entry) => {
      const failure = failures.find((other) => !other.exists && other.relativePath === entry.source);
      return failure === undefined ? [] : [{ entry, error: new Error(failure.message) }];
    }),
  };
}
