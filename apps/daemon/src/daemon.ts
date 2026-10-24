import { type Channel, serve } from '@elsewise/transport';
import { DirectoryWatcher } from './directory-watcher';
import { TEMPORARY_FILE_PATTERN } from './fs/file';
import { type FileSystemOptions, FileSystemServiceImpl } from './fs/service';
import { FileSystemService } from './gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { GitService } from './gen/elsewise/daemon/git/v1/git_service_pb';
import { InfoService } from './gen/elsewise/daemon/info/v1/info_service_pb';
import { type GitOptions, GitServiceImpl } from './git/service';
import { InfoServiceImpl } from './info/service';

export interface Daemon {
  /** Serves daemon services on the given channel. */
  register(channel: Channel): void;
}

export interface DaemonOptions {
  /** Overrides for the file system service's defaults. */
  fileSystem?: Partial<FileSystemOptions>;

  /** Overrides for the git service's defaults. */
  git?: Partial<GitOptions>;
}

/** Bootstraps the daemon. */
export function createDaemon(options: DaemonOptions = {}): Daemon {
  const watcher = new DirectoryWatcher({
    ignore: ['**/.git/objects/**', '**/node_modules/**', TEMPORARY_FILE_PATTERN],
  });

  const info = new InfoServiceImpl();
  const fileSystem = new FileSystemServiceImpl(watcher, {
    readLimitBytes: 10 * 1024 * 1024,
    listingLimit: 10_000,
    pollIntervalMs: 5_000,
    debounceMs: 50,
    ...options.fileSystem,
  });
  const git = new GitServiceImpl(watcher, {
    readLimitBytes: 10 * 1024 * 1024,
    logLimit: 500,
    pollIntervalMs: 5_000,
    debounceMs: 100,
    ...options.git,
  });

  return {
    register(channel) {
      serve(channel, InfoService, info);
      serve(channel, FileSystemService, fileSystem);
      serve(channel, GitService, git);
    },
  };
}
