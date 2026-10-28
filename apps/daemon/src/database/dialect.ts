import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import {
  CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

/**
 * A Kysely dialect over Node's SQLite.
 *
 * To be replaced when Kysely supports Node's SQLite: https://github.com/kysely-org/kysely/issues/1292.
 */
export class NodeSqliteDialect implements Dialect {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new NodeSqliteDriver(this.#database);
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }

  createIntrospector(db: Kysely<unknown>) {
    return new SqliteIntrospector(db);
  }
}

// Nothing here serialises access to the one connection: `SqliteAdapter` reports `supportsMultipleConnections` as
// false, so Kysely's runtime driver holds a mutex around every acquire/release pair, as it does for its own driver.
class NodeSqliteDriver implements Driver {
  readonly #database: DatabaseSync;
  readonly #connection: NodeSqliteConnection;

  constructor(database: DatabaseSync) {
    this.#database = database;
    this.#connection = new NodeSqliteConnection(database);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {
    this.#database.close();
  }
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.#database.prepare(compiledQuery.sql);
    const parameters = compiledQuery.parameters as SQLInputValue[];
    if (statement.columns().length > 0) {
      return { rows: statement.all(...parameters) as R[] };
    }
    const { changes, lastInsertRowid } = statement.run(...parameters);
    return { rows: [], numAffectedRows: BigInt(changes), insertId: BigInt(lastInsertRowid) };
  }

  // biome-ignore lint/correctness/useYield: the connection has no stream to yield from.
  async *streamQuery(): AsyncIterableIterator<never> {
    throw new Error('Streaming queries are not supported.');
  }
}
