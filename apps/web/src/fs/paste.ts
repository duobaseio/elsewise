import type { Workspace } from '@elsewise/frontend-plugin';
import type { Daemon } from '@/daemon';

/**
 * An entry to paste, relative to its workspace without a trailing `/`.
 */
export interface PasteEntry {
  readonly source: string;
  readonly destination: string;
  readonly folder: boolean;
}

/**
 * Moves `entry` if `cut`, through git in a git workspace, or copies it otherwise.
 */
export async function pasteEntry(
  daemon: Daemon,
  workspace: Workspace,
  cut: boolean,
  entry: PasteEntry,
  overwrite: boolean,
): Promise<void> {
  const request = { relativePath: entry.source, newRelativePath: entry.destination, overwrite };
  if (!cut) {
    await daemon.fileSystem.copyEntry({ root: workspace.absolutePath, ...request });
  } else if (workspace.state === 'ok' || workspace.state === 'detached') {
    await daemon.git.move({ absolutePath: workspace.absolutePath, ...request });
  } else {
    await daemon.fileSystem.moveEntry({ root: workspace.absolutePath, ...request });
  }
}
