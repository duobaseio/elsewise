import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  WatchDirectoriesResponse_Unavailable_Reason as DirectoryReason,
  WatchFilesResponse_Unavailable_Reason as FileReason,
  WatchRootsResponse_Root_Mode as Mode,
  WatchRootsResponse_Root_Reason as Reason,
  DirectoryListing_Entry_Type as Type,
  type WatchDirectoriesResponse,
  type WatchFilesResponse,
} from '../../src/gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { collect } from '../harness';
import { FileSystemHarness } from './harness';

const posix = process.platform !== 'win32';

const NEVER_POLL = 60_000; // A poll interval no test outlasts.

let harness: FileSystemHarness;
let root: string;

async function start(pollIntervalMs: number): Promise<void> {
  harness = await FileSystemHarness.start({ readLimitBytes: 1024, listingLimit: 3, pollIntervalMs });
  root = harness.protocolRoot;
}

beforeEach(() => start(NEVER_POLL));

afterEach(async () => {
  await harness.close();
});

function sha256(content: string | Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(content).digest());
}

/** Returns the names in the latest directory listing reported for the path or the reason it is unavailable. */
function directoryNames(
  seen: WatchDirectoriesResponse[],
  relativePath: string,
): string[] | DirectoryReason | undefined {
  const state = seen.findLast((response) => response.relativePath === relativePath)?.state;
  if (state?.case === 'unavailable') {
    return state.value.reason;
  }
  return state?.value?.entries.map((entry) => entry.name);
}

/** Returns the latest hash reported for the path or the reason it is unavailable. */
function fileHash(seen: WatchFilesResponse[], relativePath: string): Uint8Array | FileReason | undefined {
  const state = seen.findLast((response) => response.relativePath === relativePath)?.state;
  return state?.case === 'unavailable' ? state.value.reason : state?.value?.hash;
}

describe('paths', () => {
  test('rejects a unary call for a relative root or a path that leaves the root', async () => {
    const relative = harness.client.readFile({ root: 'relative', relativePath: 'a.txt' });
    await expect(relative).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    const outside = harness.client.readFile({ root, relativePath: '../outside' });
    await expect(outside).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });

  test('fails a watch stream for a path that leaves the root', async () => {
    const call = harness.client.watchFiles();
    const { ended } = collect(call.responses);

    await call.send({ root, relativePaths: ['../outside'] });

    await expect(ended).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
  });

  test('refuses changes directly on the root', async () => {
    const content = new TextEncoder().encode('new');
    const calls = [
      harness.client.writeFile({ root, relativePath: '', content }),
      harness.client.createDirectory({ root, relativePath: '' }),
      harness.client.renameEntry({ root, relativePath: '', newRelativePath: 'moved' }),
      harness.client.deleteEntry({ root, relativePath: '' }),
    ];

    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ code: Code.INVALID_ARGUMENT });
    }
  });
});

describe('WatchDirectories', () => {
  test('reports a directory immediately and whenever it changes', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), '');
    const call = harness.client.watchDirectories();
    const { seen } = collect(call.responses);

    await call.send({ root, relativePaths: [''] });
    await expect.poll(() => directoryNames(seen, '')).toEqual(['a.txt']);

    await fs.writeFile(harness.nativeAt('b.txt'), '');
    await expect.poll(() => directoryNames(seen, '')).toEqual(['a.txt', 'b.txt']);

    await fs.rm(harness.nativeAt('a.txt'));
    await expect.poll(() => directoryNames(seen, '')).toEqual(['b.txt']);
    call.cancel();
  });

  test('reports a missing directory as unavailable until it appears', async () => {
    const call = harness.client.watchDirectories();
    const { seen } = collect(call.responses);

    await call.send({ root, relativePaths: ['src'] });
    await expect.poll(() => directoryNames(seen, 'src')).toBe(DirectoryReason.NOT_FOUND);

    await fs.mkdir(harness.nativeAt('src'));
    await fs.writeFile(harness.nativeAt('src', 'a.ts'), '');
    await expect.poll(() => directoryNames(seen, 'src')).toEqual(['a.ts']);
    call.cancel();
  });

  test('reports a file as not a directory', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), '');
    const call = harness.client.watchDirectories();
    const { seen } = collect(call.responses);

    await call.send({ root, relativePaths: ['a.txt'] });

    await expect.poll(() => directoryNames(seen, 'a.txt')).toBe(DirectoryReason.NOT_A_DIRECTORY);
    call.cancel();
  });
});

describe('WatchFiles', () => {
  test('reports a file immediately and whenever its content changes', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'one');
    const call = harness.client.watchFiles();
    const { seen } = collect(call.responses);

    await call.send({ root, relativePaths: ['a.txt'] });
    await expect.poll(() => fileHash(seen, 'a.txt')).toEqual(sha256('one'));

    await fs.writeFile(harness.nativeAt('a.txt'), 'two');
    await expect.poll(() => fileHash(seen, 'a.txt')).toEqual(sha256('two'));
    call.cancel();
  });

  test('reports the hash WriteFile responded with', async () => {
    const call = harness.client.watchFiles();
    const { seen } = collect(call.responses);
    await call.send({ root, relativePaths: ['a.txt'] });
    await expect.poll(() => fileHash(seen, 'a.txt')).toBe(FileReason.NOT_FOUND);

    const content = new TextEncoder().encode('new');
    const { hash } = await harness.client.writeFile({ root, relativePath: 'a.txt', content });

    await expect.poll(() => fileHash(seen, 'a.txt')).toEqual(hash);
    call.cancel();
  });

  test('reports a deleted file and a directory as unavailable', async () => {
    await fs.mkdir(harness.nativeAt('dir'));
    const call = harness.client.watchFiles();
    const { seen } = collect(call.responses);
    await call.send({ root, relativePaths: ['a.txt', 'dir'] });
    await expect.poll(() => fileHash(seen, 'a.txt')).toBe(FileReason.NOT_FOUND);
    expect(fileHash(seen, 'dir')).toBe(FileReason.NOT_A_FILE);

    await fs.writeFile(harness.nativeAt('a.txt'), '');
    await expect.poll(() => fileHash(seen, 'a.txt')).toEqual(sha256(''));

    await fs.rm(harness.nativeAt('a.txt'));

    await expect.poll(() => fileHash(seen, 'a.txt')).toBe(FileReason.NOT_FOUND);
    call.cancel();
  });

  test('reports a file whose directory was changed', async () => {
    await fs.mkdir(harness.nativeAt('src'));
    await fs.writeFile(harness.nativeAt('src', 'a.ts'), '');
    const call = harness.client.watchFiles();
    const { seen } = collect(call.responses);
    await call.send({ root, relativePaths: ['src/a.ts'] });
    await expect.poll(() => fileHash(seen, 'src/a.ts')).toEqual(sha256(''));

    await fs.rename(harness.nativeAt('src'), harness.nativeAt('lib'));

    await expect.poll(() => fileHash(seen, 'src/a.ts')).toBe(FileReason.NOT_FOUND);
    call.cancel();
  });
});

describe('WatchRoots', () => {
  test('stream updates on roots', async () => {
    const abort = new AbortController();
    const { seen } = collect(harness.client.watchRoots({}, { signal: abort.signal }));
    await expect.poll(() => seen.at(-1)?.roots).toEqual([]);

    const call = harness.client.watchFiles();
    collect(call.responses);
    await call.send({ root, relativePaths: [] });
    await expect.poll(() => seen.at(-1)?.roots).toMatchObject([{ root, mode: Mode.NOTIFY }]);

    call.cancel();
    await expect.poll(() => seen.at(-1)?.roots).toEqual([]);
    abort.abort();
  });
});

describe('ListDirectory', () => {
  test('lists the entries sorted by name', async () => {
    await fs.mkdir(harness.nativeAt('src'));
    await fs.writeFile(harness.nativeAt('b.txt'), '');
    await fs.writeFile(harness.nativeAt('a.txt'), '');

    const { listing } = await harness.client.listDirectory({ root, relativePath: '' });

    expect(listing).toMatchObject({
      entries: [
        { name: 'a.txt', type: Type.FILE, symlink: false },
        { name: 'b.txt', type: Type.FILE, symlink: false },
        { name: 'src', type: Type.DIRECTORY, symlink: false },
      ],
      truncated: 0,
      skipped: 0,
    });
  });

  test('counts the entries over the listing limit', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await fs.writeFile(harness.nativeAt(name), '');
    }

    const { listing } = await harness.client.listDirectory({ root, relativePath: '' });

    expect(listing?.entries.map((entry) => entry.name)).toEqual(['a', 'b', 'c']);
    expect(listing?.truncated).toBe(2);
  });

  test('fails for a missing directory and file', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), '');

    const missing = harness.client.listDirectory({ root, relativePath: 'missing' });
    await expect(missing).rejects.toMatchObject({ code: Code.NOT_FOUND });
    const file = harness.client.listDirectory({ root, relativePath: 'a.txt' });
    await expect(file).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });
});

describe('ReadFile', () => {
  test('returns the content with its hash', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'hello');

    const response = await harness.client.readFile({ root, relativePath: 'a.txt' });

    expect(new TextDecoder().decode(response.content)).toBe('hello');
    expect(response.hash).toEqual(sha256('hello'));
    expect(response.binary).toBe(false);
  });

  test('refuses a file over the read limit', async () => {
    await fs.writeFile(harness.nativeAt('big.txt'), 'x'.repeat(1025));

    const call = harness.client.readFile({ root, relativePath: 'big.txt' });
    await expect(call).rejects.toMatchObject({ code: Code.RESOURCE_EXHAUSTED });
  });

  test('fails for a missing file and directory', async () => {
    await fs.mkdir(harness.nativeAt('dir'));

    const missing = harness.client.readFile({ root, relativePath: 'missing.txt' });
    await expect(missing).rejects.toMatchObject({ code: Code.NOT_FOUND });
    const directory = harness.client.readFile({ root, relativePath: 'dir' });
    await expect(directory).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
  });
});

describe('WriteFile', () => {
  const content = new TextEncoder().encode('new');

  test('creates the file and its parent directories', async () => {
    const response = await harness.client.writeFile({ root, relativePath: 'a/b/c.txt', content });

    expect(response.hash).toEqual(sha256('new'));
    await expect(fs.readFile(harness.nativeAt('a', 'b', 'c.txt'), 'utf8')).resolves.toBe('new');
    await expect(fs.readdir(harness.nativeAt('a', 'b'))).resolves.toEqual(['c.txt']);
  });

  test('refuses to create a file that already exists', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'old');

    const call = harness.client.writeFile({ root, relativePath: 'a.txt', content });
    await expect(call).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await expect(fs.readFile(harness.nativeAt('a.txt'), 'utf8')).resolves.toBe('old');
  });

  test('replaces a file that matches the base hash', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'old');

    await harness.client.writeFile({ root, relativePath: 'a.txt', baseHash: sha256('old'), content });

    await expect(fs.readFile(harness.nativeAt('a.txt'), 'utf8')).resolves.toBe('new');
  });

  test('refuses a file that no longer matches the base hash', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'changed');

    const stale = harness.client.writeFile({ root, relativePath: 'a.txt', baseHash: sha256('old'), content });
    await expect(stale).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    const deleted = harness.client.writeFile({ root, relativePath: 'gone.txt', baseHash: sha256('old'), content });
    await expect(deleted).rejects.toMatchObject({ code: Code.FAILED_PRECONDITION });
    await expect(fs.readFile(harness.nativeAt('a.txt'), 'utf8')).resolves.toBe('changed');
  });
});

describe('CreateDirectory', () => {
  test('creates the directory and its parent directories', async () => {
    await harness.client.createDirectory({ root, relativePath: 'a/b' });

    expect((await fs.stat(harness.nativeAt('a', 'b'))).isDirectory()).toBe(true);
  });

  test('refuses a path that already has an entry', async () => {
    await fs.mkdir(harness.nativeAt('a'));

    const call = harness.client.createDirectory({ root, relativePath: 'a' });
    await expect(call).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
  });
});

describe('RenameEntry', () => {
  test('moves the entry and creates the parent directories of its new path', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'hello');

    await harness.client.renameEntry({ root, relativePath: 'a.txt', newRelativePath: 'dir/b.txt' });

    await expect(fs.readFile(harness.nativeAt('dir', 'b.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.readdir(harness.nativeAt())).resolves.toEqual(['dir']);
  });

  test('refuses a new path that already has an entry', async () => {
    await fs.writeFile(harness.nativeAt('a.txt'), 'a');
    await fs.writeFile(harness.nativeAt('b.txt'), 'b');

    const call = harness.client.renameEntry({ root, relativePath: 'a.txt', newRelativePath: 'b.txt' });
    await expect(call).rejects.toMatchObject({ code: Code.ALREADY_EXISTS });
    await expect(fs.readFile(harness.nativeAt('b.txt'), 'utf8')).resolves.toBe('b');
  });

  test('renames an entry to another capitalization of the same name', async () => {
    await fs.writeFile(harness.nativeAt('readme.md'), '');

    await harness.client.renameEntry({ root, relativePath: 'readme.md', newRelativePath: 'README.md' });

    await expect(fs.readdir(harness.nativeAt())).resolves.toEqual(['README.md']);
  });

  test('fails for a missing entry', async () => {
    const call = harness.client.renameEntry({ root, relativePath: 'missing.txt', newRelativePath: 'b.txt' });
    await expect(call).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});

describe('DeleteEntry', () => {
  test('deletes a directory recursively', async () => {
    await fs.mkdir(harness.nativeAt('dir', 'nested'), { recursive: true });
    await fs.writeFile(harness.nativeAt('dir', 'nested', 'a.txt'), '');

    await harness.client.deleteEntry({ root, relativePath: 'dir' });

    await expect(fs.readdir(harness.nativeAt())).resolves.toEqual([]);
  });

  test.runIf(posix)('deletes a symbolic link and not what it references', async () => {
    await fs.mkdir(harness.nativeAt('dir'));
    await fs.writeFile(harness.nativeAt('dir', 'a.txt'), '');
    await fs.symlink(harness.nativeAt('dir'), harness.nativeAt('link'));

    await harness.client.deleteEntry({ root, relativePath: 'link' });

    await expect(fs.readdir(harness.nativeAt('dir'))).resolves.toEqual(['a.txt']);
  });

  test('fails for a missing entry', async () => {
    const call = harness.client.deleteEntry({ root, relativePath: 'missing' });
    await expect(call).rejects.toMatchObject({ code: Code.NOT_FOUND });
  });
});

describe('polling', () => {
  beforeEach(async () => {
    await harness.close();
    await start(200);
  });

  test('reports a directory whose changes are not notified', async () => {
    await fs.mkdir(harness.nativeAt('node_modules', 'pkg'), { recursive: true });
    const call = harness.client.watchDirectories();
    const { seen } = collect(call.responses);
    await call.send({ root, relativePaths: ['node_modules/pkg'] });
    await expect.poll(() => directoryNames(seen, 'node_modules/pkg')).toEqual([]);

    await fs.writeFile(harness.nativeAt('node_modules', 'pkg', 'index.js'), '');

    await expect.poll(() => directoryNames(seen, 'node_modules/pkg')).toEqual(['index.js']);
    call.cancel();
  });

  test('falls back to polling a root that cannot be notified', async () => {
    const missing = `${root}/missing`;
    const abort = new AbortController();
    const roots = collect(harness.client.watchRoots({}, { signal: abort.signal }));
    const call = harness.client.watchFiles();
    const { seen } = collect(call.responses);

    await call.send({ root: missing, relativePaths: ['a.txt'] });
    await expect
      .poll(() => roots.seen.at(-1)?.roots)
      .toMatchObject([{ root: missing, mode: Mode.POLL, reason: Reason.OTHER }]);
    await expect.poll(() => fileHash(seen, 'a.txt')).toBe(FileReason.NOT_FOUND);

    await fs.mkdir(harness.nativeAt('missing'));
    await fs.writeFile(harness.nativeAt('missing', 'a.txt'), 'late');

    await expect.poll(() => fileHash(seen, 'a.txt')).toEqual(sha256('late'));
    call.cancel();
    abort.abort();
  });
});
