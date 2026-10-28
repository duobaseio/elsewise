import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** Represents a migration. */
export interface Migration {
  /** The timestamp prefixed to the file's name (e.g. `20261024064553`). */
  version: string;

  /** The rest of the file's name (e.g. `v0_1_0`). */
  description: string;

  /** The statements. */
  sql: string;
}

/** Applies missing migrations to the database. */
export function migrate(database: DatabaseSync, migrations: readonly Migration[]): string[] {
  database.exec(`
    create table if not exists schema_revision (
        version text not null primary key,   -- 20261024065238
        description text not null,           -- v0_1_0
        hash text not null,                  -- sha256 in base64
        executed_at integer not null         -- unix ms
    ) strict
  `);
  const applied = database.prepare('select version, description, hash from schema_revision').all();
  const known = new Map(migrations.map((migration) => [migration.version, hash(migration)]));
  for (const revision of applied) {
    const expected = known.get(revision.version as string);
    if (expected === undefined) {
      throw new Error(`The database has an unknown migration ${revision.version}_${revision.description}.`);
    }
    if (expected !== revision.hash) {
      throw new Error(`Migration ${revision.version}_${revision.description} has changed since it was applied.`);
    }
  }
  const versions = new Set(applied.map((revision) => revision.version as string));

  const record = database.prepare(`
    insert into schema_revision (version, description, hash, executed_at)
    values (?, ?, ?, ?)
  `);
  const appliedVersions: string[] = [];
  const foreignKeys = database.prepare('pragma foreign_keys').get()?.foreign_keys === 1;
  database.exec('pragma foreign_keys = off');
  try {
    for (const migration of migrations) {
      if (versions.has(migration.version)) {
        continue;
      }
      database.exec('begin');
      try {
        database.exec(migration.sql);
        if (database.prepare('pragma foreign_key_check').all().length > 0) {
          throw new Error(
            `Migration ${migration.version}_${migration.description} leaves rows that violate a foreign key.`,
          );
        }
        record.run(migration.version, migration.description, known.get(migration.version) as string, Date.now());
        database.exec('commit');
      } catch (error) {
        database.exec('rollback');
        throw error;
      }
      appliedVersions.push(migration.version);
    }
  } finally {
    if (foreignKeys) {
      database.exec('pragma foreign_keys = on');
    }
  }
  return appliedVersions;
}

// Hashes a file's name followed by its contents.
function hash(migration: Migration): string {
  return createHash('sha256')
    .update(`${migration.version}_${migration.description}.sql`)
    .update(migration.sql)
    .digest('base64');
}
