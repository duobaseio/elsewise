import { isUtf8 } from 'node:buffer';
import type { Dirent, Stats } from 'node:fs';
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

/** Fails with ALREADY_EXISTS unless the path is refused. */
export async function refuseOccupiedPath(absoluteNativePath: string, acceptable: 'empty' | 'missing'): Promise<void> {
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
