import { isUtf8 } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Code } from '@elsewise/transport';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DirectoryListing_Entry_Type as Type } from '../gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { listDirectory, refuseOccupiedPath } from './directory';

let root: string;

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'elsewise-directory-')));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('listDirectory', () => {
  test('lists the entries sorted by name with types', async () => {
    await fs.mkdir(path.join(root, 'b'));
    await fs.writeFile(path.join(root, 'a'), '');
    await fs.writeFile(path.join(root, 'C'), '');

    await expect(listDirectory(root, 10)).resolves.toEqual({
      entries: [
        { name: 'C', type: Type.FILE, symlink: false },
        { name: 'a', type: Type.FILE, symlink: false },
        { name: 'b', type: Type.DIRECTORY, symlink: false },
      ],
      truncated: 0,
      skipped: 0,
    });
  });

  test('types a symbolic link by what it points to', async () => {
    await fs.mkdir(path.join(root, 'dir'));
    await fs.writeFile(path.join(root, 'file'), '');
    await fs.symlink(path.join(root, 'dir'), path.join(root, 'to-dir'), 'dir');
    await fs.symlink(path.join(root, 'file'), path.join(root, 'to-file'));
    await fs.symlink(path.join(root, 'missing'), path.join(root, 'to-missing'));

    const { entries } = await listDirectory(root, 10);

    expect(entries).toEqual([
      { name: 'dir', type: Type.DIRECTORY, symlink: false },
      { name: 'file', type: Type.FILE, symlink: false },
      { name: 'to-dir', type: Type.DIRECTORY, symlink: true },
      { name: 'to-file', type: Type.FILE, symlink: true },
      { name: 'to-missing', type: Type.OTHER, symlink: true },
    ]);
  });

  test('keeps the first entries up to the limit', async () => {
    for (const name of ['c', 'a', 'd', 'b']) {
      await fs.writeFile(path.join(root, name), '');
    }

    const listing = await listDirectory(root, 3);

    expect(listing.entries?.map((entry) => entry.name)).toEqual(['a', 'b', 'c']);
    expect(listing.truncated).toBe(1);
  });

  test('skips an entry whose name is not UTF-8', async ({ skip }) => {
    await fs.writeFile(path.join(root, 'ok'), '');
    const bad = Buffer.concat([Buffer.from(`${root}${path.sep}bad-`), Buffer.from([0xff])]);
    const created = await fs
      .writeFile(bad, '')
      .then(() => true)
      .catch(() => false);
    const names = await fs.readdir(root, { encoding: 'buffer' });
    if (!created || names.every((name) => isUtf8(name))) {
      skip('the file system does not allow a non UTF-8 file name.');
    }

    await expect(listDirectory(root, 10)).resolves.toEqual({
      entries: [{ name: 'ok', type: Type.FILE, symlink: false }],
      truncated: 0,
      skipped: 1,
    });
  });

  test('fails for a missing directory', async () => {
    await expect(listDirectory(path.join(root, 'missing'), 10)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('refuseOccupiedPath', () => {
  test('accepts a missing path', async () => {
    await expect(refuseOccupiedPath(path.join(root, 'missing'), 'missing')).resolves.toBeUndefined();
    await expect(refuseOccupiedPath(path.join(root, 'missing'), 'empty')).resolves.toBeUndefined();
  });

  test('accepts an empty directory only when acceptable is empty', async () => {
    await fs.mkdir(path.join(root, 'empty'));
    await expect(refuseOccupiedPath(path.join(root, 'empty'), 'empty')).resolves.toBeUndefined();
    await expect(refuseOccupiedPath(path.join(root, 'empty'), 'missing')).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
  });

  test('refuses a directory with entries', async () => {
    await fs.mkdir(path.join(root, 'full'));
    await fs.writeFile(path.join(root, 'full', 'file'), '');
    await expect(refuseOccupiedPath(path.join(root, 'full'), 'empty')).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
    await expect(refuseOccupiedPath(path.join(root, 'full'), 'missing')).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
  });

  test('refuses a file', async () => {
    await fs.writeFile(path.join(root, 'file'), '');
    await expect(refuseOccupiedPath(path.join(root, 'file'), 'empty')).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
    await expect(refuseOccupiedPath(path.join(root, 'file'), 'missing')).rejects.toMatchObject({
      code: Code.ALREADY_EXISTS,
    });
  });
});
