import fs from 'node:fs';
import path from 'node:path';

/**
 * Atomically writes `value` as pretty-printed JSON to `target`, creating its parent directories if they do not exist.
 */
export function writeJsonSync(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}
