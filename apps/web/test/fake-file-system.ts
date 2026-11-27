import { create } from '@bufbuild/protobuf';
import { Code, TransportError } from '@elsewise/transport';
import type { FileHandle } from '@/fs/file-handle';
import {
  FileSystemService,
  ReadFileResponseSchema,
  type WatchFilesResponse,
  WatchFilesResponseSchema,
  WriteFileResponseSchema,
} from '@/gen/elsewise/daemon/file_system/v1/file_system_service_pb';

type FileSystem = ConstructorParameters<typeof FileHandle>[0];

/**
 * A daemon's file system that keeps files in memory, and whose watch reports a file only when `report` asks it to.
 */
export function fakeFileSystem() {
  const disk = new Map<string, { content: Uint8Array; hash: Uint8Array; binary: boolean }>();
  const watches: string[][] = [];
  const reads: string[] = [];
  const writes: { relativePath: string; content: string }[] = [];
  const pending: WatchFilesResponse[] = [];
  let wake: (() => void) | undefined;
  let cancelled = false;
  let ended = false;
  let failure: Error | undefined;
  let version = 0;

  const fileSystem: FileSystem = {
    ...(Object.fromEntries(
      FileSystemService.methods.map((method) => [
        method.localName,
        () => {
          throw new Error('not faked');
        },
      ]),
    ) as unknown as FileSystem),
    readFile: async ({ relativePath = '' }) => {
      reads.push(relativePath);
      const file = disk.get(relativePath);
      if (file === undefined) {
        throw new TransportError(Code.NOT_FOUND, `${relativePath} not found`);
      }
      return create(ReadFileResponseSchema, file);
    },
    writeFile: async ({ relativePath = '', baseHash, content = new Uint8Array(), overwrite = false }) => {
      const current = disk.get(relativePath)?.hash;
      if (!overwrite && current?.join() !== baseHash?.join()) {
        throw new TransportError(Code.FAILED_PRECONDITION, `${relativePath} changed`);
      }
      const hash = new Uint8Array([++version]);
      disk.set(relativePath, { content, hash, binary: false });
      writes.push({ relativePath, content: new TextDecoder('utf-8', { ignoreBOM: true }).decode(content) });
      return create(WriteFileResponseSchema, { hash });
    },
    watchFiles: () => ({
      send: async ({ relativePaths = [] }) => {
        watches.push([...relativePaths]);
      },
      close() {},
      cancel() {
        cancelled = true;
        wake?.();
      },
      responses: (async function* () {
        while (!cancelled && !ended) {
          const next = pending.shift();
          if (next) {
            yield next;
          } else {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        }
        if (failure !== undefined) {
          throw failure;
        }
      })(),
    }),
  };

  return {
    fileSystem,
    watches,
    reads,
    writes,
    cancelled: () => cancelled,
    /**
     * Ends the watch's stream, with `error` if given.
     */
    end(error?: Error) {
      ended = true;
      failure = error;
      wake?.();
    },
    /**
     * Changes the file on disk, without reporting it.
     */
    put(relativePath: string, content: string | Uint8Array) {
      const binary = typeof content !== 'string';
      disk.set(relativePath, {
        content: binary ? content : new TextEncoder().encode(content),
        hash: new Uint8Array([++version]),
        binary,
      });
    },
    /**
     * Reports the file's state on disk to the watch.
     */
    report(relativePath: string) {
      const file = disk.get(relativePath);
      pending.push(
        create(WatchFilesResponseSchema, {
          relativePath,
          state:
            file === undefined ? { case: 'unavailable', value: {} } : { case: 'content', value: { hash: file.hash } },
        }),
      );
      wake?.();
    },
  };
}
