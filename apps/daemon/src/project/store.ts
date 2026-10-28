import { randomUUID } from 'node:crypto';
import { type Insertable, type Selectable, sql, type Updateable } from 'kysely';
import type { Database } from '../database/database';
import type { Project, Workspace } from '../gen/database';

/** A row of the `project` table, with the path of its main workspace. */
export type ProjectRow = Selectable<Project> & Pick<Selectable<Workspace>, 'absolute_path'>;

/** A row of the `workspace` table. */
export type WorkspaceRow = Selectable<Workspace>;

// Breaks the tie between rows created in the same millisecond.
const PROJECT_ROWID = sql`project.rowid`;
const WORKSPACE_ROWID = sql`workspace.rowid`;

/** The store for projects and workspaces. */
export class ProjectStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /** Return projects sorted by oldest first. */
  getProjects(): Promise<ProjectRow[]> {
    return this.#projects().orderBy('project.created_at').orderBy(PROJECT_ROWID).execute();
  }

  /** Returns the project if it exists. */
  getProject(id: string): Promise<ProjectRow | undefined> {
    return this.#projects().where('project.id', '=', id).executeTakeFirst();
  }

  /** Returns whether a project has the folder. */
  async hasProjectFolder(folder: string): Promise<boolean> {
    const row = await this.#db.selectFrom('project').select('id').where('folder', '=', folder).executeTakeFirst();
    return row !== undefined;
  }

  /** Creates a project. */
  createProject(
    values: Omit<Insertable<Project>, 'id' | 'created_at'> & Pick<Insertable<Workspace>, 'absolute_path'>,
  ): Promise<{ project: ProjectRow; workspace: WorkspaceRow }> {
    return this.#db.transaction().execute(async (trx) => {
      const { absolute_path, ...rest } = values;
      const project = await trx
        .insertInto('project')
        .values({ ...rest, id: randomUUID(), created_at: Date.now() })
        .returningAll()
        .executeTakeFirstOrThrow();
      const workspace = await trx
        .insertInto('workspace')
        .values({
          id: randomUUID(),
          project_id: project.id,
          name: project.name,
          absolute_path,
          main: 1,
          created_at: project.created_at,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { project: { ...project, absolute_path: workspace.absolute_path }, workspace };
    });
  }

  /** Updates the project. Returns the updated project or undefined if it does not exist */
  async updateProject(
    id: string,
    values: Omit<Updateable<Project>, 'id' | 'created_at'>,
  ): Promise<ProjectRow | undefined> {
    const result = await this.#db.updateTable('project').set(values).where('id', '=', id).executeTakeFirst();
    return result.numUpdatedRows > 0n ? this.getProject(id) : undefined;
  }

  /** Deletes the project with its workspaces. Returns whether it existed. */
  async deleteProject(id: string): Promise<boolean> {
    const result = await this.#db.deleteFrom('project').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  /** Returns workspaces of the project sorted by the main and then oldest first. */
  getWorkspaces(projectId: string): Promise<WorkspaceRow[]> {
    return this.#db
      .selectFrom('workspace')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('main', 'desc')
      .orderBy('created_at')
      .orderBy(WORKSPACE_ROWID)
      .execute();
  }

  /** Returns the workspace of the project. */
  getWorkspace(projectId: string, id: string): Promise<WorkspaceRow | undefined> {
    return this.#db
      .selectFrom('workspace')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Returns the workspace at the path. */
  findWorkspaceByPath(absolutePath: string): Promise<WorkspaceRow | undefined> {
    return this.#db.selectFrom('workspace').selectAll().where('absolute_path', '=', absolutePath).executeTakeFirst();
  }

  /** Creates a workspace. */
  createWorkspace(values: Omit<Insertable<Workspace>, 'id' | 'main' | 'created_at'>): Promise<WorkspaceRow> {
    return this.#db
      .insertInto('workspace')
      .values({ ...values, id: randomUUID(), main: 0, created_at: Date.now() })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Updates the workspace. Returns the updated workspace or undefined if it does not exist. */
  updateWorkspace(
    projectId: string,
    id: string,
    values: Omit<Updateable<Workspace>, 'id' | 'project_id' | 'main' | 'created_at'>,
  ): Promise<WorkspaceRow | undefined> {
    return this.#db
      .updateTable('workspace')
      .set(values)
      .where('project_id', '=', projectId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /** Deletes the workspace. Returns whether it existed. */
  async deleteWorkspace(projectId: string, id: string): Promise<boolean> {
    const result = await this.#db
      .deleteFrom('workspace')
      .where('project_id', '=', projectId)
      .where('id', '=', id)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  /** Selects projects joined with the path of their main workspace. */
  #projects() {
    return this.#db
      .selectFrom('project')
      .innerJoin('workspace', (join) =>
        join.onRef('workspace.project_id', '=', 'project.id').on('workspace.main', '=', 1),
      )
      .selectAll('project')
      .select('workspace.absolute_path');
  }
}
