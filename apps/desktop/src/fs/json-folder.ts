import fs from 'node:fs';
import path from 'node:path';
import { PluginId } from '@elsewise/frontend-plugin';
import * as z from 'zod';

/**
 * Returns each `<id>.json` in `folder`, sorted by id, with its content that `schema` parses or with why it could not
 * be read.
 *
 * Ignores anything but files, and `folder` when it does not exist or cannot be read.
 */
export function readJsonFolder<T>(
  folder: string,
  schema: z.ZodType<T>,
): ({ id: string; content: T } | { id: string; error: string })[] {
  let files: string[];
  try {
    files = fs
      .readdirSync(folder)
      .filter(
        (file) => file.endsWith('.json') && fs.statSync(path.join(folder, file), { throwIfNoEntry: false })?.isFile(),
      )
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`${folder}: unreadable, skipping it`, error);
    }
    return [];
  }

  return files.map((file) => {
    const id = file.slice(0, -'.json'.length);
    const location = path.join(folder, file);
    if (!PluginId.safeParse(id).success) {
      return { id, error: `${location} has an invalid id` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(location, 'utf8'));
    } catch (error) {
      return {
        id,
        error:
          error instanceof SyntaxError
            ? `${location} is not JSON: ${error.message}`
            : `failed to read ${location}: ${(error as Error).message}`,
      };
    }

    const content = schema.safeParse(parsed);
    if (!content.success) {
      return { id, error: `${location} is malformed:\n${z.prettifyError(content.error)}` };
    }

    return { id, content: content.data };
  });
}
