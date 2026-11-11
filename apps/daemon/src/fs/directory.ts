import { isUtf8 } from 'node:buffer';
import type { BigIntStats, Dirent, Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, TransportError } from '@elsewise/transport';
import {
  DirectoryListing_Entry_Type,
  type DirectoryListingSchema,
} from '../gen/elsewise/daemon/file_system/v1/file_system_service_pb';
import { errnoOf } from './error';

/** Lists a directory. */
export async function listDirectory(
  absoluteNativePath: string,
  limit: number,
): Promise<MessageInitShape<typeof DirectoryListingSchema>> {
  const children = await fs.readdir(absoluteNativePath, { withFileTypes: true, encoding: 'buffer' });
  const named = children
    .filter((child) => isUtf8(child.name))
    .map((child) => ({ name: child.name.toString(), child }))
    .sort((a, b) => compare(a.name, b.name));
  const kept = named.slice(0, limit);

  const entries = await Promise.all(
    kept.map(async ({ name, child }) => {
      if (!child.isSymbolicLink()) {
        return { name, type: typeOf(child), symlink: false };
      }
      const followed = await fs.stat(path.join(absoluteNativePath, name)).catch(() => undefined);
      return { name, type: followed ? typeOf(followed) : DirectoryListing_Entry_Type.OTHER, symlink: true };
    }),
  );

  return { entries, truncated: named.length - kept.length, skipped: children.length - named.length };
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function typeOf(entry: Dirent<Buffer> | Stats): DirectoryListing_Entry_Type {
  if (entry.isDirectory()) {
    return DirectoryListing_Entry_Type.DIRECTORY;
  }
  return entry.isFile() ? DirectoryListing_Entry_Type.FILE : DirectoryListing_Entry_Type.OTHER;
}

/**
 * Returns whether the file system finds the entry at `absoluteNativePath` under the path with its case swapped. A path
 * without letters has no other spelling, so it returns false.
 */
export async function isCaseInsensitive(absoluteNativePath: string): Promise<boolean> {
  const swapped = [...absoluteNativePath]
    .map((character) => (character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase()))
    .join('');
  if (swapped === absoluteNativePath) {
    return false;
  }

  const entry = await fs.lstat(absoluteNativePath, { bigint: true });
  const other = await lstat(swapped);
  return other?.dev === entry.dev && other.ino === entry.ino;
}

/**
 * Returns whether `newAbsoluteNativePath` is the entry at `absoluteNativePath` itself, which a case-insensitive file
 * system finds under another spelling (e.g. readme.md -> README.md).
 */
export async function isRespelling(absoluteNativePath: string, newAbsoluteNativePath: string): Promise<boolean> {
  function normalize(absoluteNativePath: string): string {
    return absoluteNativePath.normalize('NFC').toLowerCase();
  }

  const source = await lstat(absoluteNativePath);
  const destination = await lstat(newAbsoluteNativePath);
  return (
    source !== undefined &&
    destination?.dev === source.dev &&
    destination.ino === source.ino &&
    normalize(absoluteNativePath) === normalize(newAbsoluteNativePath)
  );
}

/** Fails with ALREADY_EXISTS if an entry is at the path, unless `acceptable` is `'empty'` and it is an empty folder. */
export async function refuseExisting(absoluteNativePath: string, acceptable: 'empty' | 'missing'): Promise<void> {
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

/**
 * Fails unless the entry at `absoluteNativePath` can be copied to `newAbsoluteNativePath`.
 *
 * Fails with:
 * * ALREADY_EXISTS if any entry is at `newAbsoluteNativePath`, unless `overwrite`.
 * * INVALID_ARGUMENT if `newAbsoluteNativePath` is inside the entry, or overwriting would remove the entry.
 */
export async function refuseCopy(
  absoluteNativePath: string,
  newAbsoluteNativePath: string,
  overwrite: boolean,
): Promise<void> {
  const source = await fs.lstat(absoluteNativePath, { bigint: true });
  const destination = await lstat(newAbsoluteNativePath);

  if (overwrite) {
    await refuseOverwrite(source, destination, absoluteNativePath);
  } else if (destination) {
    throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the new path');
  }

  if (await contains(source, newAbsoluteNativePath)) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'an entry cannot be copied into itself');
  }
}

/**
 * Fails unless the entry at `absoluteNativePath` can be moved to `newAbsoluteNativePath`.
 *
 * Fails with:
 * * ALREADY_EXISTS if another entry is at `newAbsoluteNativePath`, unless `overwrite`.
 * * INVALID_ARGUMENT if `newAbsoluteNativePath` is inside the entry, or overwriting would remove the entry.
 */
export async function refuseMove(
  absoluteNativePath: string,
  newAbsoluteNativePath: string,
  overwrite: boolean,
): Promise<void> {
  const source = await fs.lstat(absoluteNativePath, { bigint: true });
  const destination = await lstat(newAbsoluteNativePath);
  if (destination && !(await isRespelling(absoluteNativePath, newAbsoluteNativePath))) {
    if (!overwrite) {
      throw new TransportError(Code.ALREADY_EXISTS, 'an entry is already at the new path');
    }
    await refuseOverwrite(source, destination, absoluteNativePath);
  }

  if (await contains(source, newAbsoluteNativePath)) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'an entry cannot be moved into itself');
  }
}

async function lstat(absoluteNativePath: string): Promise<BigIntStats | undefined> {
  return fs.lstat(absoluteNativePath, { bigint: true }).catch((error: unknown) => {
    if (errnoOf(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
}

async function refuseOverwrite(
  source: BigIntStats,
  destination: BigIntStats | undefined,
  absoluteNativePath: string,
): Promise<void> {
  if (destination?.dev === source.dev && destination.ino === source.ino) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'an entry cannot overwrite itself');
  }

  if (destination && (await contains(destination, absoluteNativePath))) {
    throw new TransportError(Code.INVALID_ARGUMENT, 'an entry cannot overwrite a folder containing it');
  }
}

/**
 * Returns whether `entry` contains `absoluteNativePath`. Paths spelled differently on a case-insensitive file system
 * still matches.
 */
async function contains(entry: BigIntStats, absoluteNativePath: string): Promise<boolean> {
  for (let folder = path.dirname(absoluteNativePath); folder !== path.dirname(folder); folder = path.dirname(folder)) {
    const ancestor = await fs.lstat(folder, { bigint: true }).catch(() => undefined);
    if (ancestor?.dev === entry.dev && ancestor.ino === entry.ino) {
      return true;
    }
  }
  return false;
}
