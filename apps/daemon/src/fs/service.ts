import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, type HandlerContext, type ServiceImpl, TransportError } from '@elsewise/transport';
import type { DirectoryWatcher } from '../directory-watcher';
import {
  type CreateDirectoryRequest,
  type DeleteEntryRequest,
  WatchDirectoriesResponse_Unavailable_Reason as DirectoryReason,
  WatchFilesResponse_Unavailable_Reason as FileReason,
  type FileSystemService,
  type ListDirectoryRequest,
  type ReadFileRequest,
  type RenameEntryRequest,
  WatchRootsResponse_Root_Mode as RootMode,
  WatchRootsResponse_Root_Reason as RootReason,
  type WatchDirectoriesRequest,
  type WatchDirectoriesResponseSchema,
  type WatchFilesRequest,
  type WatchFilesResponseSchema,
  type WatchRootsRequest,
  type WriteFileRequest,
} from '../gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { listDirectory } from './directory';
import { attempt, errnoOf } from './error';
import { createFile, hashContent, hashFile, isBinary, replaceFile } from './file';
import { toNativePath, toNativePathOrRoot, toProtocolPath } from './path';
import { type Snapshot, watchPaths } from './watch';

type DirectoryState = Exclude<MessageInitShape<typeof WatchDirectoriesResponseSchema>['state'], undefined>;
type FileState = Exclude<MessageInitShape<typeof WatchFilesResponseSchema>['state'], undefined>;

export interface FileSystemOptions {
  /** The size in bytes of the largest file `ReadFile` returns. */
  readLimitBytes: number;

  /** The most entries a directory listing holds. */
  listingLimit: number;

  /** How often every watched path is polled for changes, in milliseconds. */
  pollIntervalMs: number;

  /** How long notified changes are debounced, in milliseconds. */
  debounceMs: number;
}

/** The `FileSystemService`. */
export class FileSystemServiceImpl implements ServiceImpl<typeof FileSystemService> {
  readonly #watcher: DirectoryWatcher;
  readonly #options: FileSystemOptions;

  constructor(watcher: DirectoryWatcher, options: FileSystemOptions) {
    this.#watcher = watcher;
    this.#options = options;
  }

  watchDirectories(requests: AsyncIterable<WatchDirectoriesRequest>, { signal }: HandlerContext) {
    return watchPaths(requests, signal, {
      watcher: this.#watcher,
      pollIntervalMs: this.#options.pollIntervalMs,
      debounceMs: this.#options.debounceMs,
      includesChildren: true,
      snapshot: (absoluteNativePath) => this.#readDirectoryState(absoluteNativePath),
    });
  }

  watchFiles(requests: AsyncIterable<WatchFilesRequest>, { signal }: HandlerContext) {
    return watchPaths(requests, signal, {
      watcher: this.#watcher,
      pollIntervalMs: this.#options.pollIntervalMs,
      debounceMs: this.#options.debounceMs,
      includesChildren: false,
      snapshot: (absoluteNativePath) => this.#readFileState(absoluteNativePath),
    });
  }

  async *watchRoots(_request: WatchRootsRequest, { signal }: HandlerContext) {
    let changed = true;
    let wake: (() => void) | undefined;
    const notify = () => {
      changed = true;
      wake?.();
    };
    const observation = this.#watcher.observeRoots(notify);
    signal.addEventListener('abort', notify, { once: true });
    try {
      while (!signal.aborted) {
        if (changed) {
          changed = false;
          yield { roots: this.#roots() };
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      observation.close();
      signal.removeEventListener('abort', notify);
    }
  }

  listDirectory(request: ListDirectoryRequest) {
    return attempt(async () => {
      const absoluteNativePath = toNativePathOrRoot(request.root, request.relativePath);
      return { listing: await listDirectory(absoluteNativePath, this.#options.listingLimit) };
    });
  }

  readFile(request: ReadFileRequest) {
    return attempt(async () => {
      const absoluteNativePath = toNativePathOrRoot(request.root, request.relativePath);
      const stats = await fs.stat(absoluteNativePath);
      if (!stats.isFile()) {
        throw new TransportError(Code.FAILED_PRECONDITION, 'the path does not name a file');
      }
      this.#checkReadLimit(stats.size);
      const content = await fs.readFile(absoluteNativePath);
      this.#checkReadLimit(content.length); // Actual check, the initial check was a cheap screen.
      return { hash: hashContent(content), binary: isBinary(content), content };
    });
  }

  writeFile(request: WriteFileRequest) {
    return attempt(async () => {
      const absoluteNativePath = toNativePath(request.root, request.relativePath);
      if (request.baseHash.length === 0) {
        await createFile(absoluteNativePath, request.content);
      } else {
        const current = await hashFile(absoluteNativePath).catch((error) => {
          if (errnoOf(error) === 'ENOENT') {
            return undefined;
          }
          throw error;
        });
        if (!current?.equals(request.baseHash)) {
          throw new TransportError(Code.FAILED_PRECONDITION, 'the file no longer matches the base hash');
        }
        await replaceFile(absoluteNativePath, request.content);
      }
      return { hash: hashContent(request.content) };
    });
  }

  createDirectory(request: CreateDirectoryRequest) {
    return attempt(async () => {
      const absoluteNativePath = toNativePath(request.root, request.relativePath);
      await fs.mkdir(path.dirname(absoluteNativePath), { recursive: true });
      await fs.mkdir(absoluteNativePath); // Split forces call to fail if the directory already exist.
      return {};
    });
  }

  renameEntry(request: RenameEntryRequest) {
    return attempt(async () => {
      const absoluteNativePath = toNativePath(request.root, request.relativePath);
      const newAbsoluteNativePath = toNativePath(request.root, request.newRelativePath);
      const from = await fs.lstat(absoluteNativePath, { bigint: true });
      const to = await fs.lstat(newAbsoluteNativePath, { bigint: true }).catch((error) => {
        if (errnoOf(error) === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      // On a case-insensitive file system, `to` may be present even though the case is different
      // (e.g. readme.md -> README.md).
      const respelled =
        to?.dev === from.dev && to.ino === from.ino && fold(absoluteNativePath) === fold(newAbsoluteNativePath);
      if (to && !respelled) {
        throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the new path');
      }
      await fs.mkdir(path.dirname(newAbsoluteNativePath), { recursive: true });
      await fs.rename(absoluteNativePath, newAbsoluteNativePath);
      return {};
    });
  }

  deleteEntry(request: DeleteEntryRequest) {
    return attempt(async () => {
      await fs.rm(toNativePath(request.root, request.relativePath), { recursive: true });
      return {};
    });
  }

  #roots() {
    return this.#watcher
      .roots()
      .map(({ root, mode, reason }) => ({
        root: toProtocolPath(root),
        mode: mode === 'notify' ? RootMode.NOTIFY : RootMode.POLL,
        ...(reason && { reason: reason === 'watch-limit' ? RootReason.WATCH_LIMIT : RootReason.OTHER }),
      }))
      .sort((a, b) => (a.root < b.root ? -1 : 1));
  }

  #checkReadLimit(size: number): void {
    if (size > this.#options.readLimitBytes) {
      throw new TransportError(Code.RESOURCE_EXHAUSTED, 'the file is over the read limit');
    }
  }

  async #readDirectoryState(absoluteNativePath: string): Promise<Snapshot<DirectoryState>> {
    try {
      const listing = await listDirectory(absoluteNativePath, this.#options.listingLimit);
      const digest = createHash('sha256').update(JSON.stringify(listing)).digest('base64');
      return { key: `listing:${digest}`, state: { case: 'listing', value: listing } };
    } catch (error) {
      const reason = directoryReason(error);
      return { key: `unavailable:${reason}`, state: { case: 'unavailable', value: { reason } } };
    }
  }

  async #readFileState(absoluteNativePath: string): Promise<Snapshot<FileState>> {
    try {
      const stats = await fs.stat(absoluteNativePath);
      if (!stats.isFile()) {
        const reason = FileReason.NOT_A_FILE;
        return { key: `unavailable:${reason}`, state: { case: 'unavailable', value: { reason } } };
      }
      const hash = await hashFile(absoluteNativePath);
      return { key: `content:${hash.toString('base64')}`, state: { case: 'content', value: { hash } } };
    } catch (error) {
      const reason = fileReason(error);
      return { key: `unavailable:${reason}`, state: { case: 'unavailable', value: { reason } } };
    }
  }
}

function directoryReason(error: unknown): DirectoryReason {
  switch (errnoOf(error)) {
    case 'ENOENT':
      return DirectoryReason.NOT_FOUND;
    case 'ENOTDIR':
      return DirectoryReason.NOT_A_DIRECTORY;
    case 'EACCES':
    case 'EPERM':
      return DirectoryReason.PERMISSION_DENIED;
    default:
      return DirectoryReason.OTHER;
  }
}

function fileReason(error: unknown): FileReason {
  switch (errnoOf(error)) {
    case 'ENOENT':
    case 'ENOTDIR':
      return FileReason.NOT_FOUND;
    case 'EISDIR':
      return FileReason.NOT_A_FILE;
    case 'EACCES':
    case 'EPERM':
      return FileReason.PERMISSION_DENIED;
    default:
      return FileReason.OTHER;
  }
}

/** Returns the path as a case-insensitive file system compares it. */
function fold(absoluteNativePath: string): string {
  return absoluteNativePath.normalize('NFC').toLowerCase();
}
