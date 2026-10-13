import { isUtf8 } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** How much of a file's start is searched for the NUL byte that marks it a binary. */
const BINARY_PROBE_BYTES = 8000;

/** Returns the SHA-256 of the content. */
export function hashContent(content: Uint8Array): Buffer {
  return createHash('sha256').update(content).digest();
}

/** Returns the SHA-256 of a file's content. */
export async function hashFile(absoluteNativePath: string): Promise<Buffer> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(absoluteNativePath), hash);
  return hash.digest();
}

/** Returns whether the content is a binary. */
export function isBinary(content: Uint8Array): boolean {
  // As the probe is a heuristic, we run the actual UTF-8 check if it fails.
  return content.subarray(0, BINARY_PROBE_BYTES).includes(0) || !isUtf8(content);
}

/** Creates a file with the content and its parent directories. Fails with `EEXIST` if an entry is at the path. */
export async function createFile(absoluteNativePath: string, content: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(absoluteNativePath), { recursive: true });
  await fs.writeFile(absoluteNativePath, content, { flag: 'wx' });
}

/** Matches the path of a temporary file `replaceFile` writes before renaming it over the file it replaces. */
export const TEMPORARY_FILE_PATTERN = /[\\/]\.[^\\/]+\.[0-9a-f]{12}\.tmp$/;

/** Atomically replaces a file's content. Creates the file and its parent directories if they do not exist. */
export async function replaceFile(absoluteNativePath: string, content: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(absoluteNativePath), { recursive: true });
  // Actual path if the target is a symlink.
  const realPath = await fs.realpath(absoluteNativePath).catch(() => absoluteNativePath);
  const mode = await fs.stat(realPath).then(
    (stats) => stats.mode,
    () => undefined,
  );

  const name = `.${path.basename(realPath)}.${randomBytes(6).toString('hex')}.tmp`;
  const temporary = path.join(path.dirname(realPath), name);
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode });
    if (mode !== undefined) {
      await fs.chmod(temporary, mode);
    }
    await fs.rename(temporary, realPath);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
