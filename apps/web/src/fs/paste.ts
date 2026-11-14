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
  /**
   * Whether `source` is an absolute path or a path relative to the workspace.
   */
  readonly absolute?: boolean;
  readonly folder: boolean;
}

/**
 * Moves `entries` if `cut`, through git in a git workspace unless a source is absolute, or copies them otherwise, in one
 * request. Returns those whose destination exists and those that failed otherwise.
 */
export async function pasteEntries(
  daemon: Daemon,
  workspace: Workspace,
  cut: boolean,
  entries: readonly PasteEntry[],
  overwrite: boolean,
): Promise<{ conflicting: PasteEntry[]; failures: { entry: PasteEntry; error: Error }[] }> {
  const outside = entries.some((entry) => entry.absolute);
  const root = outside ? '' : workspace.absolutePath;
  const request = {
    entries: entries.map((entry) => ({
      relativePath: outside && !entry.absolute ? `${workspace.absolutePath}/${entry.source}` : entry.source,
      newRelativePath: outside ? `${workspace.absolutePath}/${entry.destination}` : entry.destination,
    })),
    overwrite,
  };
  const failures = !cut
    ? (await daemon.fileSystem.copyEntries({ root, ...request })).failures.map((failure) => ({
        ...failure,
        exists: failure.reason === CopyReason.ALREADY_EXISTS,
      }))
    : !outside && (workspace.state === 'ok' || workspace.state === 'detached')
      ? (await daemon.git.move({ absolutePath: workspace.absolutePath, ...request })).failures.map((failure) => ({
          ...failure,
          exists: failure.reason === MoveReason.ALREADY_EXISTS,
        }))
      : (await daemon.fileSystem.moveEntries({ root, ...request })).failures.map((failure) => ({
          ...failure,
          exists: failure.reason === MoveEntriesReason.ALREADY_EXISTS,
        }));

  return {
    conflicting: entries.filter((_, index) =>
      failures.some((failure) => failure.exists && failure.relativePath === request.entries[index]?.relativePath),
    ),
    failures: entries.flatMap((entry, index) => {
      const failure = failures.find(
        (other) => !other.exists && other.relativePath === request.entries[index]?.relativePath,
      );
      return failure === undefined ? [] : [{ entry, error: new Error(failure.message) }];
    }),
  };
}
