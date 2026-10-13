import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFile, isBinary, replaceFile, TEMPORARY_FILE_PATTERN } from './file';

const posix = process.platform !== 'win32';
const content = new TextEncoder().encode('new');

let root: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-file-')));
});

afterEach(async () => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('isBinary', () => {
  test('marks content with a NUL byte or invalid UTF-8 as binary', () => {
    expect(isBinary(new Uint8Array([104, 0, 105]))).toBe(true);
    expect(isBinary(new Uint8Array([0xc3, 0x28]))).toBe(true);
    expect(isBinary(new TextEncoder().encode('héllo'))).toBe(false);
  });
});

describe('createFile', () => {
  test('only one of two concurrent creations may succeed', async () => {
    const target = path.join(root, 'a.txt');

    const outcomes = await Promise.allSettled([
      createFile(target, new TextEncoder().encode('first')),
      createFile(target, new TextEncoder().encode('second')),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: 'EEXIST' });
    const fulfilled = outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
    await expect(fs.readFile(target, 'utf8')).resolves.toBe(fulfilled === 0 ? 'first' : 'second');
  });
});

describe('replaceFile', () => {
  test.runIf(posix)('keeps the mode of the file it replaces', async () => {
    await fs.writeFile(path.join(root, 'run.sh'), 'old', { mode: 0o755 });

    await replaceFile(path.join(root, 'run.sh'), content);

    // 0o777 drops bits that aren't the permission.
    expect((await fs.stat(path.join(root, 'run.sh'))).mode & 0o777).toBe(0o755);
  });

  test.runIf(posix)('writes through a symbolic link', async () => {
    await fs.writeFile(path.join(root, 'target.txt'), 'old');
    await fs.symlink(path.join(root, 'target.txt'), path.join(root, 'link.txt'));

    await replaceFile(path.join(root, 'link.txt'), content);

    expect((await fs.lstat(path.join(root, 'link.txt'))).isSymbolicLink()).toBe(true);
    await expect(fs.readFile(path.join(root, 'target.txt'), 'utf8')).resolves.toBe('new');
  });

  test('writes a temporary file the pattern matches beside the target, then renames it over', async () => {
    const rename = vi.spyOn(fs, 'rename');
    await fs.writeFile(path.join(root, 'a.txt'), 'old');

    await replaceFile(path.join(root, 'a.txt'), content);

    const [temporary, destination] = rename.mock.calls[0] ?? [];
    expect(String(temporary)).toMatch(TEMPORARY_FILE_PATTERN);
    expect(path.dirname(String(temporary))).toBe(root);
    expect(destination).toBe(path.join(root, 'a.txt'));
    await expect(fs.readdir(root)).resolves.toEqual(['a.txt']);
  });

  test('removes the temporary file when the replacement fails', async () => {
    await fs.mkdir(path.join(root, 'dir'));

    // Using a directory as path should fail.
    await expect(replaceFile(path.join(root, 'dir'), content)).rejects.toThrow();

    await expect(fs.readdir(root)).resolves.toEqual(['dir']);
  });
});

describe('TEMPORARY_FILE_PATTERN', () => {
  test.each(['/src/.a.txt.0123456789ab.tmp', 'C:\\src\\.a.txt.0123456789ab.tmp', '/src/.Makefile.0123456789ab.tmp'])(
    'matches %j',
    (target) => {
      expect(target).toMatch(TEMPORARY_FILE_PATTERN);
    },
  );

  test.each(['a.tmp', '.notes.tmp', '.a.txt.0123456789ab.tmp.bak', 'a.txt.0123456789ab.tmp'])(
    'does not match %j',
    (name) => {
      expect(path.join(root, name)).not.toMatch(TEMPORARY_FILE_PATTERN);
    },
  );
});
