import { DatabaseSync } from 'node:sqlite';
import { Kysely } from 'kysely';
import type { DB } from '../gen/database';
import { NodeSqliteDialect } from './dialect';
import { type Migration, migrate } from './migrate';

export type Database = Kysely<DB>;

export interface DatabaseHandle {
  /** The open database. */
  readonly database: Database;

  /** Closes the database. */
  close(): Promise<void>;
}

/**
 * Opens the database at the file (or creates one when missing) and handle database migrations.
 *
 * `:memory:` as the file opens an in memory database.
 */
export function openDatabase(file: string, migrations: readonly Migration[]): DatabaseHandle {
  const sqlite = new DatabaseSync(file);
  try {
    sqlite.exec('pragma journal_mode = wal');
    sqlite.exec('pragma foreign_keys = on');
    migrate(sqlite, migrations);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  const database = new Kysely<DB>({ dialect: new NodeSqliteDialect(sqlite) });
  return {
    database,
    async close() {
      await database.destroy();
      if (sqlite.isOpen) {
        sqlite.close();
      }
    },
  };
}
