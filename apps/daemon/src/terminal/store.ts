import { randomUUID } from 'node:crypto';
import { type Insertable, type Selectable, sql, type Updateable } from 'kysely';
import type { Database } from '../database/database';
import type { Terminal, Workspace } from '../gen/database';

/** A row of the `terminal` table. */
export type TerminalRow = Selectable<Terminal>;

/** A row of the `workspace` table with the name of its project. */
export type WorkspaceRow = Selectable<Workspace> & { project_name: string };

// Breaks the tie between rows created in the same millisecond.
const TERMINAL_ROWID = sql`terminal.rowid`;

/** The store for terminals. */
export class TerminalStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /**
   * Returns the terminals of the workspace sorted by oldest to newest.
   *
   * No `workspaceId` returns all terminals.
   */
  getTerminals(workspaceId?: string): Promise<TerminalRow[]> {
    let query = this.#db.selectFrom('terminal').selectAll();
    if (workspaceId !== undefined) {
      query = query.where('workspace_id', '=', workspaceId);
    }
    return query.orderBy('created_at').orderBy(TERMINAL_ROWID).execute();
  }

  /** Returns the terminal if it exists. */
  getTerminal(id: string): Promise<TerminalRow | undefined> {
    return this.#db.selectFrom('terminal').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Returns the workspace with the name of its project if it exists. */
  getWorkspace(id: string): Promise<WorkspaceRow | undefined> {
    return this.#db
      .selectFrom('workspace')
      .innerJoin('project', 'project.id', 'workspace.project_id')
      .selectAll('workspace')
      .select('project.name as project_name')
      .where('workspace.id', '=', id)
      .executeTakeFirst();
  }

  /** Creates a terminal. */
  createTerminal(
    values: Pick<Insertable<Terminal>, 'workspace_id' | 'name' | 'columns' | 'rows'>,
  ): Promise<TerminalRow> {
    return this.#db
      .insertInto('terminal')
      .values({ ...values, id: randomUUID(), created_at: Date.now() })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Updates the terminal. Returns the updated terminal or undefined if it does not exist. */
  updateTerminal(
    id: string,
    values: Omit<Updateable<Terminal>, 'id' | 'workspace_id' | 'created_at'>,
  ): Promise<TerminalRow | undefined> {
    return this.#db.updateTable('terminal').set(values).where('id', '=', id).returningAll().executeTakeFirst();
  }

  /** Deletes the terminal. Returns if it existed. */
  async deleteTerminal(id: string): Promise<boolean> {
    const result = await this.#db.deleteFrom('terminal').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
