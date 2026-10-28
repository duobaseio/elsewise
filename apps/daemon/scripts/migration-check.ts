import path from 'node:path';
import { execa } from 'execa';

/** Ensures there are no drift between the migrations and schema.s */

const database = path.resolve(import.meta.dirname, '..', 'database');

// Atlas exits 0 regardless if the schemas differ.
const { stdout } = await execa(
  'atlas',
  ['schema', 'diff', '--env', 'local', '--from', 'file://migrations', '--to', 'env://src'],
  { cwd: database },
);
console.log(stdout);
if (!stdout.startsWith('Schemas are synced')) {
  process.exitCode = 1;
}
